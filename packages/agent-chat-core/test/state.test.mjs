import assert from "node:assert/strict";
import test from "node:test";

import {
  createInitialChatState,
  isTerminalTurnStatus,
  reduceChatEvent,
  replayChatEvents,
  selectActiveTurn,
  selectPendingInteraction,
  selectThreadRunState,
  selectThreadSurfaces,
  selectThreadTurns,
  selectTurnItems,
  validateChatEvent,
} from "../dist/index.js";
import {
  baseInteraction,
  baseItem,
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

test("empty completed message upsert preserves previously streamed text", () => {
  let state = replayChatEvents([
    chatEvent("item.delta", { itemId: "assistant-1", delta: "streamed answer" }, { id: "delta" }),
  ]);
  state = reduceChatEvent(state, chatEvent("item.upsert", baseItem({
    id: "assistant-1",
    text: "",
    status: "completed",
    completedAt: ISO,
  }), { id: "empty-complete" })).state;

  assert.equal(state.items["assistant-1"].text, "streamed answer");
  assert.equal(state.items["assistant-1"].status, "completed");
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

test("unsupported, missing and fractional protocol versions reject without applying state", () => {
  const valid = chatEvent("warning", { code: "ok", message: "ok" }, { id: "proto" });
  const initial = createInitialChatState();

  for (const [candidate, reason] of [
    [{ ...valid, protocolVersion: 2 }, "unsupported_protocol"],
    [{ ...valid, protocolVersion: undefined }, "unsupported_protocol"],
    [{ ...valid, protocolVersion: 1.5 }, "unsupported_protocol"],
  ]) {
    const validated = validateChatEvent(candidate);
    assert.equal(validated.ok, false);
    assert.equal(validated.reason, reason);
    const result = reduceChatEvent(initial, candidate);
    assert.equal(result.applied, false);
    assert.equal(result.reason, reason);
    assert.strictEqual(result.state, initial);
    assert.deepEqual(result.state.seenEventIds, []);
  }
});

test("unknown event types reject safely and do not consume event ids", () => {
  const valid = chatEvent("warning", { code: "ok", message: "ok" }, { id: "shared-id" });
  const unknown = { ...valid, type: "future.event" };
  const initial = createInitialChatState();

  assert.equal(validateChatEvent(unknown).ok, false);
  assert.equal(validateChatEvent(unknown).reason, "unknown_event_type");
  const rejected = reduceChatEvent(initial, unknown);
  assert.equal(rejected.applied, false);
  assert.equal(rejected.reason, "unknown_event_type");
  assert.strictEqual(rejected.state, initial);
  assert.deepEqual(rejected.state.seenEventIds, []);

  const applied = reduceChatEvent(rejected.state, valid);
  assert.equal(applied.applied, true);
  assert.deepEqual(applied.state.seenEventIds, ["shared-id"]);
});

test("malformed envelopes reject without throwing or mutating state", () => {
  const valid = chatEvent("usage.updated", { totalTokens: 1 }, { id: "env", streamId: "s", sequence: 1 });
  const initial = createInitialChatState();
  const malformed = [
    null,
    undefined,
    "event",
    { ...valid, id: "" },
    { ...valid, source: "" },
    { ...valid, occurredAt: "" },
    { ...valid, threadId: "" },
    { ...valid, payload: undefined },
    { ...valid, stream: { id: "", sequence: 1 } },
    { ...valid, stream: { id: "s", sequence: 1.5 } },
    { ...valid, stream: { id: "s", sequence: Number.NaN } },
    { ...valid, stream: { sequence: 1 } },
    { ...valid, turnId: "" },
  ];

  for (const candidate of malformed) {
    const validated = validateChatEvent(candidate);
    assert.equal(validated.ok, false, JSON.stringify(candidate));
    assert.equal(validated.reason, "invalid_event");
    const result = reduceChatEvent(initial, candidate);
    assert.equal(result.applied, false);
    assert.equal(result.reason, "invalid_event");
    assert.strictEqual(result.state, initial);
  }
  assert.equal(validateChatEvent(valid).ok, true);
});

test("gap then high-water snapshot then next sequence succeeds", () => {
  const one = chatEvent("usage.updated", { totalTokens: 1 }, { id: "one", streamId: "s", sequence: 1 });
  const gap = chatEvent("usage.updated", { totalTokens: 3 }, { id: "three", streamId: "s", sequence: 3 });
  const snapshot = chatEvent("thread.snapshot", {
    thread: baseThread({ title: "recovered" }),
    turns: [baseTurn({ status: "completed" })],
    items: [],
    surfaces: [],
    interactions: [],
  }, { id: "snapshot-hw", streamId: "s", sequence: 10 });
  const next = chatEvent("usage.updated", { totalTokens: 11 }, { id: "eleven", streamId: "s", sequence: 11 });

  let state = reduceChatEvent(createInitialChatState(), one).state;
  const gapped = reduceChatEvent(state, gap);
  assert.equal(gapped.applied, false);
  assert.equal(gapped.reason, "stream_gap");
  assert.equal(gapped.state.streamSequences.s, 1);

  const recovered = reduceChatEvent(gapped.state, snapshot);
  assert.equal(recovered.applied, true);
  assert.equal(recovered.state.threads["thread-1"].title, "recovered");
  assert.equal(recovered.state.streamSequences.s, 10);
  assert.equal(recovered.state.resyncRequests.s, undefined);

  const advanced = reduceChatEvent(recovered.state, next);
  assert.equal(advanced.applied, true);
  assert.equal(advanced.state.streamSequences.s, 11);
  assert.equal(advanced.state.usageByThread["thread-1"].totalTokens, 11);
});

test("delta-only item is returned by selectTurnItems", () => {
  const state = replayChatEvents([
    chatEvent("turn.upsert", baseTurn()),
    chatEvent("item.delta", { itemId: "assistant-1", delta: "Hola" }, { id: "delta-only" }),
  ]);
  const items = selectTurnItems(state, "turn-1");
  assert.equal(items.length, 1);
  assert.equal(items[0].id, "assistant-1");
  assert.equal(items[0].text, "Hola");
  assert.equal(items[0].status, "streaming");
  assert.deepEqual(state.turns["turn-1"].itemIds, ["assistant-1"]);
});

test("item-before-turn heals and turn.upsert preserves itemIds", () => {
  const state = replayChatEvents([
    chatEvent("item.upsert", baseItem({ id: "early-item", text: "before turn" }), { id: "early-item" }),
    chatEvent("item.delta", { itemId: "delta-item", delta: "stream" }, { id: "early-delta" }),
    chatEvent("turn.upsert", baseTurn({ itemIds: ["from-upsert"] }), { id: "late-turn" }),
  ]);
  assert.deepEqual(state.turns["turn-1"].itemIds, ["delta-item", "from-upsert", "early-item"]);
  assert.deepEqual(selectTurnItems(state, "turn-1").map((item) => item.id), ["delta-item", "early-item"]);
});

test("terminal turn cannot reopen via turn.upsert", () => {
  const completed = replayChatEvents([
    chatEvent("turn.upsert", baseTurn({ status: "completed", completedAt: ISO, itemIds: ["kept"] }), { id: "done" }),
  ]);
  const reopened = reduceChatEvent(
    completed,
    chatEvent("turn.upsert", baseTurn({ status: "running", itemIds: [] }), { id: "reopen" }),
  );
  assert.equal(reopened.applied, false);
  assert.equal(reopened.reason, "invalid_turn_transition");
  assert.strictEqual(reopened.state, completed);
  assert.equal(reopened.state.turns["turn-1"].status, "completed");
  assert.deepEqual(reopened.state.turns["turn-1"].itemIds, ["kept"]);

  const same = reduceChatEvent(
    completed,
    chatEvent("turn.upsert", baseTurn({ status: "completed", itemIds: ["extra"] }), { id: "refresh" }),
  );
  assert.equal(same.applied, true);
  assert.equal(same.state.turns["turn-1"].status, "completed");
  assert.deepEqual(same.state.turns["turn-1"].itemIds, ["kept", "extra"]);
});

test("two threads with colliding native ids do not overwrite or delete each other", () => {
  const initial = replayChatEvents([
    chatEvent("thread.upsert", baseThread({ id: "thread-2" }), { id: "t2", threadId: "thread-2" }),
    chatEvent("item.upsert", baseItem({
      id: "foreign-item",
      threadId: "thread-2",
      turnId: "turn-1",
      text: "keep me",
    }), { id: "foreign-item", threadId: "thread-2", turnId: "turn-1" }),
    chatEvent("thread.upsert", baseThread()),
    chatEvent("turn.upsert", baseTurn()),
    chatEvent("item.upsert", baseItem({ id: "old-item", text: "old" }), { id: "old-item" }),
  ]);

  const collidingTurn = reduceChatEvent(
    initial,
    chatEvent("turn.upsert", baseTurn({ id: "turn-1", threadId: "thread-2" }), {
      id: "collide-turn",
      threadId: "thread-2",
      turnId: "turn-1",
    }),
  );
  assert.equal(collidingTurn.applied, false);
  assert.equal(collidingTurn.reason, "invalid_event");
  assert.equal(initial.turns["turn-1"].threadId, "thread-1");

  const snapshot = reduceChatEvent(initial, chatEvent("thread.snapshot", {
    thread: baseThread({ title: "fresh" }),
    turns: [baseTurn({ status: "completed" })],
    items: [],
    surfaces: [],
    interactions: [],
  }, { id: "snapshot-collide" }));
  assert.equal(snapshot.applied, true);
  assert.equal(snapshot.state.items["old-item"], undefined);
  assert.equal(snapshot.state.items["foreign-item"].text, "keep me");
  assert.equal(snapshot.state.items["foreign-item"].threadId, "thread-2");
  assert.equal(snapshot.state.turns["turn-1"].status, "completed");
});

test("snapshot foreign members and envelope payload mismatches reject", () => {
  const initial = createInitialChatState();
  const foreignSnapshot = reduceChatEvent(initial, chatEvent("thread.snapshot", {
    thread: baseThread(),
    turns: [baseTurn({ threadId: "thread-2" })],
    items: [],
    surfaces: [],
    interactions: [],
  }, { id: "foreign-member" }));
  assert.equal(foreignSnapshot.applied, false);
  assert.equal(foreignSnapshot.reason, "invalid_event");
  assert.strictEqual(foreignSnapshot.state, initial);

  const mismatches = [
    chatEvent("thread.upsert", baseThread({ id: "thread-2" }), { id: "thread-mismatch" }),
    chatEvent("turn.upsert", baseTurn({ threadId: "thread-2" }), { id: "turn-thread-mismatch" }),
    chatEvent("turn.upsert", baseTurn({ id: "turn-9" }), { id: "turn-id-mismatch", turnId: "turn-1" }),
    chatEvent("item.upsert", baseItem({ threadId: "thread-2" }), { id: "item-thread-mismatch" }),
    chatEvent("item.upsert", baseItem({ turnId: "turn-9" }), { id: "item-turn-mismatch" }),
    chatEvent("interaction.requested", baseInteraction({ threadId: "thread-2" }), { id: "ix-thread-mismatch" }),
    chatEvent("surface.upsert", baseSurface({ threadId: "thread-2" }), { id: "surface-thread-mismatch" }),
  ];
  for (const event of mismatches) {
    const validated = validateChatEvent(event);
    assert.equal(validated.ok, false, event.id);
    assert.equal(validated.reason, "invalid_event", event.id);
    const result = reduceChatEvent(initial, event);
    assert.equal(result.applied, false, event.id);
    assert.equal(result.reason, "invalid_event", event.id);
    assert.strictEqual(result.state, initial);
    assert.deepEqual(result.state.seenEventIds, []);
  }
});

test("selectThreadSurfaces treats missing placement as inline and preserves state order", () => {
  const missing = baseSurface({ id: "surface-missing" });
  delete missing.presentation;
  const explicitInline = baseSurface({
    id: "surface-inline",
    presentation: { title: "Inline table", preferredSurface: "inline" },
  });
  const panel = baseSurface({
    id: "surface-panel",
    presentation: { title: "Panel table", preferredSurface: "panel" },
  });
  const fullscreen = baseSurface({
    id: "surface-fullscreen",
    presentation: { title: "Fullscreen table", preferredSurface: "fullscreen" },
  });
  const foreign = baseSurface({
    id: "surface-foreign",
    threadId: "thread-2",
    presentation: { preferredSurface: "inline" },
  });
  const unknownPlacement = baseSurface({
    id: "surface-unknown",
    presentation: { preferredSurface: "drawer" },
  });
  const state = replayChatEvents([
    chatEvent("thread.upsert", baseThread()),
    chatEvent("surface.upsert", missing, { id: "upsert-missing" }),
    chatEvent("surface.upsert", explicitInline, { id: "upsert-inline" }),
    chatEvent("surface.upsert", panel, { id: "upsert-panel" }),
    chatEvent("surface.upsert", fullscreen, { id: "upsert-fullscreen" }),
    chatEvent("surface.upsert", foreign, { id: "upsert-foreign", threadId: "thread-2" }),
    chatEvent("surface.upsert", unknownPlacement, { id: "upsert-unknown" }),
  ]);

  Object.values(state.surfaces).forEach((surface) => Object.freeze(surface));
  const before = structuredClone(state.surfaces);

  assert.deepEqual(
    selectThreadSurfaces(state, "thread-1").map((surface) => surface.id),
    ["surface-missing", "surface-inline", "surface-panel", "surface-fullscreen", "surface-unknown"],
  );
  assert.deepEqual(
    selectThreadSurfaces(state, "thread-1", "inline").map((surface) => surface.id),
    ["surface-missing", "surface-inline", "surface-unknown"],
  );
  assert.deepEqual(
    selectThreadSurfaces(state, "thread-1", "panel").map((surface) => surface.id),
    ["surface-panel"],
  );
  assert.deepEqual(
    selectThreadSurfaces(state, "thread-1", "fullscreen").map((surface) => surface.id),
    ["surface-fullscreen"],
  );

  const selectedMissing = selectThreadSurfaces(state, "thread-1", "inline")[0];
  assert.strictEqual(selectedMissing, state.surfaces["surface-missing"]);
  assert.deepEqual(state.surfaces, before);
});

test("isTerminalTurnStatus covers only completed, failed, interrupted and cancelled", () => {
  assert.equal(isTerminalTurnStatus("completed"), true);
  assert.equal(isTerminalTurnStatus("failed"), true);
  assert.equal(isTerminalTurnStatus("interrupted"), true);
  assert.equal(isTerminalTurnStatus("cancelled"), true);
  for (const status of ["queued", "running", "waiting_approval", "waiting_input"]) {
    assert.equal(isTerminalTurnStatus(status), false, status);
  }
});

test("selectActiveTurn returns the latest non-terminal turn without copying it", () => {
  const state = replayChatEvents([
    chatEvent("thread.upsert", baseThread()),
    chatEvent("turn.upsert", baseTurn({ id: "turn-old", status: "completed", startedAt: "2026-08-13T10:00:00.000Z" }), {
      id: "old-turn",
      turnId: "turn-old",
    }),
    chatEvent("turn.upsert", baseTurn({ id: "turn-active", status: "running", startedAt: "2026-08-13T11:00:00.000Z" }), {
      id: "active-turn",
      turnId: "turn-active",
    }),
    chatEvent("turn.upsert", baseTurn({ id: "turn-queued", status: "queued", startedAt: "2026-08-13T12:00:00.000Z" }), {
      id: "queued-turn",
      turnId: "turn-queued",
    }),
  ]);
  Object.values(state.turns).forEach((turn) => Object.freeze(turn));
  const before = structuredClone(state.turns);
  const active = selectActiveTurn(state, "thread-1");
  assert.equal(active?.id, "turn-queued");
  assert.strictEqual(active, state.turns["turn-queued"]);
  assert.equal(selectActiveTurn(state, "missing"), undefined);
  assert.deepEqual(state.turns, before);
});

test("selectThreadRunState derives waiting, queued, streaming, busy, terminal, error and idle", () => {
  const empty = createInitialChatState();
  assert.deepEqual(selectThreadRunState(empty, "thread-1"), { phase: "idle" });

  const errorThread = replayChatEvents([
    chatEvent("thread.upsert", baseThread({ status: "error" })),
  ]);
  assert.deepEqual(selectThreadRunState(errorThread, "thread-1"), { phase: "failed" });

  let waiting = replayChatEvents([
    chatEvent("thread.upsert", baseThread()),
    chatEvent("turn.upsert", baseTurn({ status: "running" })),
    chatEvent("item.upsert", baseItem({ status: "streaming", text: "partial" })),
    chatEvent("interaction.requested", baseInteraction()),
  ]);
  Object.values(waiting.turns).forEach((turn) => Object.freeze(turn));
  Object.values(waiting.interactions).forEach((interaction) => Object.freeze(interaction));
  const waitingBefore = structuredClone({ turns: waiting.turns, interactions: waiting.interactions, items: waiting.items });
  const waitingState = selectThreadRunState(waiting, "thread-1");
  assert.equal(waitingState.phase, "waiting");
  assert.equal(waitingState.waitingKind, "approval");
  assert.strictEqual(waitingState.turn, waiting.turns["turn-1"]);
  assert.strictEqual(waitingState.pendingInteraction, waiting.interactions["interaction-1"]);
  assert.equal(waitingState.streaming, undefined);
  assert.deepEqual({ turns: waiting.turns, interactions: waiting.interactions, items: waiting.items }, waitingBefore);

  waiting = reduceChatEvent(waiting, chatEvent("turn.status", { status: "waiting_input" }, { id: "wait-input" })).state;
  waiting = reduceChatEvent(waiting, chatEvent("interaction.resolved", {
    interactionId: "interaction-1",
    resolution: { decision: "accept" },
    resolvedAt: ISO,
  }, { id: "resolved-wait" })).state;
  const inputWait = selectThreadRunState(waiting, "thread-1");
  assert.equal(inputWait.phase, "waiting");
  assert.equal(inputWait.waitingKind, "input");
  assert.equal(inputWait.pendingInteraction, undefined);

  const queued = replayChatEvents([
    chatEvent("turn.upsert", baseTurn({ status: "queued" })),
  ]);
  assert.deepEqual(selectThreadRunState(queued, "thread-1"), {
    phase: "queued",
    turn: queued.turns["turn-1"],
  });
  assert.strictEqual(selectThreadRunState(queued, "thread-1").turn, queued.turns["turn-1"]);

  const streaming = replayChatEvents([
    chatEvent("turn.upsert", baseTurn({ status: "running" })),
    chatEvent("item.upsert", baseItem({ status: "streaming", text: "hello" })),
  ]);
  const streamingState = selectThreadRunState(streaming, "thread-1");
  assert.equal(streamingState.phase, "streaming");
  assert.equal(streamingState.streaming, true);
  assert.strictEqual(streamingState.turn, streaming.turns["turn-1"]);

  const busy = replayChatEvents([
    chatEvent("turn.upsert", baseTurn({ status: "running" })),
    chatEvent("item.upsert", baseItem({ status: "pending", text: "queued work" })),
  ]);
  const busyState = selectThreadRunState(busy, "thread-1");
  assert.equal(busyState.phase, "busy");
  assert.equal(busyState.streaming, undefined);
  assert.strictEqual(busyState.turn, busy.turns["turn-1"]);

  for (const status of ["completed", "failed", "interrupted", "cancelled"]) {
    const terminal = replayChatEvents([
      chatEvent("turn.upsert", baseTurn({ status, completedAt: ISO })),
    ]);
    const derived = selectThreadRunState(terminal, "thread-1");
    assert.equal(derived.phase, status);
    assert.strictEqual(derived.turn, terminal.turns["turn-1"]);
    assert.equal(selectActiveTurn(terminal, "thread-1"), undefined);
  }
});

test("selectThreadRunState prefers waiting over queued and latest active over older terminals", () => {
  const state = replayChatEvents([
    chatEvent("thread.upsert", baseThread()),
    chatEvent("turn.upsert", baseTurn({
      id: "turn-done",
      status: "completed",
      startedAt: "2026-08-13T09:00:00.000Z",
    }), { id: "done-turn", turnId: "turn-done" }),
    chatEvent("turn.upsert", baseTurn({
      id: "turn-queued",
      status: "queued",
      startedAt: "2026-08-13T10:00:00.000Z",
    }), { id: "queued-turn", turnId: "turn-queued" }),
    chatEvent("interaction.requested", baseInteraction({
      id: "question-1",
      turnId: "turn-queued",
      kind: "question",
      title: "Need a path",
    }), { id: "ask", turnId: "turn-queued" }),
  ]);
  const derived = selectThreadRunState(state, "thread-1");
  assert.equal(derived.phase, "waiting");
  assert.equal(derived.waitingKind, "input");
  assert.strictEqual(derived.turn, state.turns["turn-queued"]);
  assert.strictEqual(derived.pendingInteraction, state.interactions["question-1"]);
  assert.strictEqual(selectActiveTurn(state, "thread-1"), state.turns["turn-queued"]);
});
