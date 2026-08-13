import assert from "node:assert/strict";
import test from "node:test";

import {
  createInitialChatState,
  reduceChatEvent,
  replayChatEvents,
  selectPendingInteraction,
  selectThreadTurns,
  selectTurnItems,
} from "../dist/index.js";
import {
  baseInteraction,
  baseSurface,
  baseThread,
  baseTurn,
  chatEvent,
  ISO,
} from "./helpers.mjs";

test("replays 10,000 ordered events deterministically", () => {
  const events = Array.from({ length: 10_000 }, (_, index) =>
    chatEvent(
      "usage.updated",
      { totalTokens: index + 1 },
      { id: `usage-${index + 1}`, streamId: "stream-1", sequence: index + 1 },
    ),
  );

  const first = replayChatEvents(events);
  const second = replayChatEvents(events);

  assert.deepEqual(first, second);
  assert.equal(first.usageByThread["thread-1"].totalTokens, 10_000);
  assert.equal(first.streamSequences["stream-1"], 10_000);
  assert.equal(first.seenEventIds.length, 10_000);
  assert.deepEqual(first.resyncRequests, {});
});

test("deduplicates by event id without mutating state", () => {
  const event = chatEvent("thread.upsert", baseThread(), { id: "same-id" });
  const first = reduceChatEvent(createInitialChatState(), event);
  const duplicate = reduceChatEvent(first.state, event);

  assert.equal(first.applied, true);
  assert.equal(duplicate.applied, false);
  assert.equal(duplicate.reason, "duplicate");
  assert.strictEqual(duplicate.state, first.state);
});

test("detects gaps, accepts the missing event, clears resync, then accepts retry", () => {
  const one = chatEvent("usage.updated", { totalTokens: 1 }, { id: "one", streamId: "s", sequence: 1 });
  const two = chatEvent("usage.updated", { totalTokens: 2 }, { id: "two", streamId: "s", sequence: 2 });
  const three = chatEvent("usage.updated", { totalTokens: 3 }, { id: "three", streamId: "s", sequence: 3 });
  let state = reduceChatEvent(createInitialChatState(), one).state;

  const gap = reduceChatEvent(state, three);
  assert.equal(gap.applied, false);
  assert.equal(gap.reason, "stream_gap");
  assert.deepEqual(gap.state.resyncRequests.s, {
    streamId: "s",
    expectedSequence: 2,
    receivedSequence: 3,
    eventId: "three",
  });
  assert.equal(gap.state.streamSequences.s, 1);

  const filled = reduceChatEvent(gap.state, two);
  assert.equal(filled.applied, true);
  assert.equal(filled.state.streamSequences.s, 2);
  assert.equal(filled.state.resyncRequests.s, undefined);

  const retried = reduceChatEvent(filled.state, three);
  assert.equal(retried.applied, true);
  assert.equal(retried.state.streamSequences.s, 3);
});

test("rejects stale and out-of-order stream events", () => {
  const current = chatEvent("usage.updated", { totalTokens: 5 }, { id: "current", streamId: "s", sequence: 5 });
  const stale = chatEvent("usage.updated", { totalTokens: 4 }, { id: "stale", streamId: "s", sequence: 4 });
  const repeatedSequence = chatEvent("usage.updated", { totalTokens: 999 }, { id: "other-id", streamId: "s", sequence: 5 });
  const state = reduceChatEvent(createInitialChatState(), current).state;

  for (const candidate of [stale, repeatedSequence]) {
    const result = reduceChatEvent(state, candidate);
    assert.equal(result.applied, false);
    assert.equal(result.reason, "stale_stream_event");
    assert.equal(result.state.usageByThread["thread-1"].totalTokens, 5);
  }
});

test("snapshot atomically replaces one thread while preserving other threads", () => {
  const initial = replayChatEvents([
    chatEvent("thread.upsert", baseThread()),
    chatEvent("turn.upsert", baseTurn()),
    chatEvent("item.upsert", {
      id: "old-item",
      threadId: "thread-1",
      turnId: "turn-1",
      kind: "message",
      status: "completed",
      text: "old",
    }),
    chatEvent("surface.upsert", baseSurface()),
    chatEvent("interaction.requested", baseInteraction()),
    chatEvent("thread.upsert", baseThread({ id: "thread-2" }), { id: "thread-2-upsert", threadId: "thread-2" }),
    chatEvent("turn.upsert", baseTurn({ id: "turn-2", threadId: "thread-2" }), { id: "turn-2-upsert", threadId: "thread-2", turnId: "turn-2" }),
  ]);

  const snapshot = chatEvent("thread.snapshot", {
    thread: baseThread({ title: "fresh" }),
    turns: [baseTurn({ status: "completed" })],
    items: [],
    surfaces: [],
    interactions: [],
    usage: { totalTokens: 42 },
  }, { id: "snapshot" });
  const state = reduceChatEvent(initial, snapshot).state;

  assert.equal(state.threads["thread-1"].title, "fresh");
  assert.equal(state.items["old-item"], undefined);
  assert.equal(state.surfaces["surface-1"], undefined);
  assert.equal(state.interactions["interaction-1"], undefined);
  assert.ok(state.threads["thread-2"]);
  assert.ok(state.turns["turn-2"]);
  assert.equal(state.usageByThread["thread-1"].totalTokens, 42);
});

test("item deltas build transcript and item upserts link once to their turn", () => {
  let state = replayChatEvents([
    chatEvent("turn.upsert", baseTurn()),
    chatEvent("item.delta", { itemId: "assistant-1", delta: "Hola " }, { id: "delta-1" }),
    chatEvent("item.delta", { itemId: "assistant-1", delta: "mundo" }, { id: "delta-2" }),
  ]);
  assert.equal(state.items["assistant-1"].text, "Hola mundo");

  const completed = {
    ...state.items["assistant-1"],
    status: "completed",
    completedAt: ISO,
  };
  state = replayChatEvents([
    chatEvent("item.upsert", completed, { id: "complete" }),
    chatEvent("item.upsert", completed, { id: "complete-again" }),
  ], state);

  assert.deepEqual(state.turns["turn-1"].itemIds, ["assistant-1"]);
  assert.deepEqual(selectTurnItems(state, "turn-1").map((item) => item.id), ["assistant-1"]);
});

test("surface revisions support merge, append page, complete and conflict detection", () => {
  let state = reduceChatEvent(
    createInitialChatState(),
    chatEvent("surface.upsert", baseSurface(), { id: "surface-upsert" }),
  ).state;

  state = reduceChatEvent(state, chatEvent("surface.patch", {
    surfaceId: "surface-1",
    baseRevision: 1,
    revision: 2,
    operation: "merge",
    payload: { page: 2, title: "Merged" },
  }, { id: "merge" })).state;
  assert.deepEqual(state.surfaces["surface-1"].payload, {
    rows: [{ id: 1 }],
    page: 2,
    title: "Merged",
  });

  state = reduceChatEvent(state, chatEvent("surface.patch", {
    surfaceId: "surface-1",
    baseRevision: 2,
    revision: 3,
    operation: "append_page",
    payload: { rows: [{ id: 2 }], page: 3 },
  }, { id: "append" })).state;
  assert.deepEqual(state.surfaces["surface-1"].payload.rows, [{ id: 1 }, { id: 2 }]);

  const conflict = reduceChatEvent(state, chatEvent("surface.patch", {
    surfaceId: "surface-1",
    baseRevision: 1,
    revision: 4,
    operation: "replace",
    payload: {},
  }, { id: "conflict" }));
  assert.equal(conflict.applied, false);
  assert.equal(conflict.reason, "surface_conflict");

  state = reduceChatEvent(state, chatEvent("surface.patch", {
    surfaceId: "surface-1",
    baseRevision: 3,
    revision: 4,
    operation: "complete",
    payload: { rows: [{ id: 1 }, { id: 2 }] },
  }, { id: "complete-surface" })).state;
  assert.equal(state.surfaces["surface-1"].status, "completed");
  assert.equal(state.surfaces["surface-1"].revision, 4);
});

test("surface replace/fail operations and stale upserts obey revision ordering", () => {
  let state = reduceChatEvent(
    createInitialChatState(),
    chatEvent("surface.upsert", baseSurface({ revision: 5 }), { id: "surface-v5" }),
  ).state;
  const stale = reduceChatEvent(
    state,
    chatEvent("surface.upsert", baseSurface({ revision: 4 }), { id: "surface-v4" }),
  );
  assert.equal(stale.applied, false);
  assert.equal(stale.reason, "surface_conflict");

  state = reduceChatEvent(state, chatEvent("surface.patch", {
    surfaceId: "surface-1",
    baseRevision: 5,
    revision: 6,
    operation: "replace",
    payload: { replacement: true },
  }, { id: "replace" })).state;
  assert.deepEqual(state.surfaces["surface-1"].payload, { replacement: true });

  state = reduceChatEvent(state, chatEvent("surface.patch", {
    surfaceId: "surface-1",
    baseRevision: 6,
    revision: 7,
    operation: "fail",
    payload: { code: "render_failed" },
  }, { id: "fail" })).state;
  assert.equal(state.surfaces["surface-1"].status, "failed");
  assert.deepEqual(state.surfaces["surface-1"].payload, { code: "render_failed" });
});

test("terminal turns reject contradictory transitions while same-status updates remain valid", () => {
  let state = replayChatEvents([
    chatEvent("turn.upsert", baseTurn({ status: "completed", completedAt: ISO }), { id: "turn-complete" }),
  ]);
  const invalid = reduceChatEvent(state, chatEvent("turn.status", { status: "running" }, { id: "turn-reopen" }));
  assert.equal(invalid.applied, false);
  assert.equal(invalid.reason, "invalid_turn_transition");
  assert.strictEqual(invalid.state, state);

  const same = reduceChatEvent(state, chatEvent("turn.status", {
    status: "completed",
    completedAt: "2026-08-13T12:01:00.000Z",
  }, { id: "turn-complete-refresh" }));
  assert.equal(same.applied, true);
  assert.equal(same.state.turns["turn-1"].completedAt, "2026-08-13T12:01:00.000Z");
  state = same.state;
});

test("partial usage updates merge and resolving an unknown interaction is a safe no-op", () => {
  let state = replayChatEvents([
    chatEvent("usage.updated", { inputTokens: 2, totalTokens: 2 }, { id: "usage-input" }),
    chatEvent("usage.updated", { outputTokens: 3, totalTokens: 5, costUsd: 0.1 }, { id: "usage-output" }),
  ]);
  assert.deepEqual(state.usageByThread["thread-1"], {
    inputTokens: 2,
    outputTokens: 3,
    totalTokens: 5,
    costUsd: 0.1,
  });
  const resolved = reduceChatEvent(state, chatEvent("interaction.resolved", {
    interactionId: "does-not-exist",
    resolution: { decision: "accept" },
  }, { id: "resolve-missing" }));
  assert.equal(resolved.applied, true);
  assert.deepEqual(resolved.state.interactions, {});
});

test("interaction lifecycle and selectors expose only pending work", () => {
  let state = replayChatEvents([
    chatEvent("thread.upsert", baseThread()),
    chatEvent("turn.upsert", baseTurn({ startedAt: ISO })),
    chatEvent("interaction.requested", baseInteraction()),
  ]);
  assert.equal(selectPendingInteraction(state, "thread-1")?.id, "interaction-1");

  state = reduceChatEvent(state, chatEvent("interaction.resolved", {
    interactionId: "interaction-1",
    resolution: { decision: "accept" },
    resolvedAt: ISO,
  }, { id: "resolved" })).state;
  assert.equal(state.interactions["interaction-1"].status, "resolved");
  assert.deepEqual(state.interactions["interaction-1"].resolution, { decision: "accept" });
  assert.equal(selectPendingInteraction(state, "thread-1"), undefined);
  assert.deepEqual(selectThreadTurns(state, "thread-1").map((turn) => turn.id), ["turn-1"]);
});

test("caps retained warning history at 1,000", () => {
  const events = Array.from({ length: 1_010 }, (_, index) =>
    chatEvent("warning", { code: `W${index}`, message: `warning ${index}` }, { id: `warning-${index}` }),
  );
  const state = replayChatEvents(events);
  assert.equal(state.warnings.length, 1_000);
  assert.equal(state.warnings[0].code, "W10");
  assert.equal(state.warnings.at(-1).code, "W1009");
});
