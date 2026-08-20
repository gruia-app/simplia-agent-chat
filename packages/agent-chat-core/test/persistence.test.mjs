import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

import {
  commitChatEvent,
  createChatRuntime,
  createInitialChatState,
  createMemoryChatPersistence,
  createThreadSnapshotEvent,
  hydrateChatRuntime,
  reduceChatEvent,
  replayChatEvents,
} from "../dist/index.js";
import {
  commitChatEvent as commitFromSubpath,
  createMemoryChatPersistence as memoryFromSubpath,
  hydrateChatRuntime as hydrateFromSubpath,
} from "../dist/persistence.js";
import {
  baseInteraction,
  baseItem,
  baseSurface,
  baseThread,
  baseTurn,
  chatEvent,
  ISO,
} from "./helpers.mjs";

const srcDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src");

function usage(id, sequence, totalTokens = sequence, extras = {}) {
  return chatEvent("usage.updated", { totalTokens }, { id, streamId: "s", sequence, ...extras });
}

function snapshotPayload(overrides = {}) {
  return {
    thread: baseThread({ title: "snap" }),
    turns: [baseTurn({ status: "completed" })],
    items: [],
    surfaces: [],
    interactions: [],
    ...overrides,
  };
}

function deferred() {
  let resolve;
  const promise = new Promise((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

async function waitUntil(predicate) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("timed out");
}

test("persistence subpath re-exports match the core index", () => {
  assert.equal(commitFromSubpath, commitChatEvent);
  assert.equal(hydrateFromSubpath, hydrateChatRuntime);
  assert.equal(memoryFromSubpath, createMemoryChatPersistence);
});

test("commit validates before append and appends before apply or notify", async () => {
  const runtime = createChatRuntime();
  const order = [];
  runtime.subscribe(() => {
    order.push("notify");
  });
  const persistence = {
    async append(event) {
      order.push(`append:${event.id}`);
      assert.equal(runtime.getState().seenEventIds.includes(event.id), false);
    },
  };

  const invalid = await commitChatEvent(runtime, persistence, null);
  assert.equal(invalid.ok, false);
  assert.equal(invalid.persisted, false);
  assert.equal(invalid.reason, "invalid_event");
  assert.deepEqual(order, []);
  assert.deepEqual(runtime.getState(), createInitialChatState());

  const event = usage("one", 1);
  const committed = await commitChatEvent(runtime, persistence, event);
  assert.equal(committed.ok, true);
  assert.equal(committed.persisted, true);
  assert.equal(committed.result.applied, true);
  assert.deepEqual(order, ["append:one", "notify"]);
});

test("append failure and pre-abort leave runtime and subscribers untouched", async () => {
  const runtime = createChatRuntime();
  let notifies = 0;
  runtime.subscribe(() => {
    notifies += 1;
  });
  let appends = 0;
  const failing = {
    async append() {
      appends += 1;
      throw new Error("journal down");
    },
  };

  const failed = await commitChatEvent(runtime, failing, usage("one", 1));
  assert.equal(failed.ok, false);
  assert.equal(failed.persisted, false);
  assert.equal(failed.reason, "append_failed");
  assert.equal(appends, 1);
  assert.equal(notifies, 0);
  assert.deepEqual(runtime.getState(), createInitialChatState());

  const controller = new AbortController();
  controller.abort();
  const aborted = await commitChatEvent(
    runtime,
    {
      async append() {
        appends += 1;
      },
    },
    usage("one", 1),
    { signal: controller.signal },
  );
  assert.equal(aborted.ok, false);
  assert.equal(aborted.reason, "aborted");
  assert.equal(appends, 1);
  assert.equal(notifies, 0);
});

test("a fulfilled duplicate append stays persisted and does not notify", async () => {
  const runtime = createChatRuntime();
  let notifies = 0;
  runtime.subscribe(() => {
    notifies += 1;
  });
  const events = [];
  const persistence = {
    async append(event) {
      events.push(event.id);
    },
  };
  const event = usage("one", 1);
  const first = await commitChatEvent(runtime, persistence, event);
  const second = await commitChatEvent(runtime, persistence, event);

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(second.persisted, true);
  assert.equal(second.result.applied, false);
  assert.equal(second.result.reason, "duplicate");
  assert.deepEqual(events, ["one", "one"]);
  assert.equal(notifies, 1);
});

test("gap, missing event, then retry persist even when the reducer does not apply", async () => {
  const runtime = createChatRuntime();
  const persistence = createMemoryChatPersistence();
  const one = await commitChatEvent(runtime, persistence, usage("one", 1));
  const gap = await commitChatEvent(runtime, persistence, usage("three", 3));
  const filled = await commitChatEvent(runtime, persistence, usage("two", 2));
  const retried = await commitChatEvent(runtime, persistence, usage("three", 3));

  assert.equal(one.result.applied, true);
  assert.equal(gap.ok, true);
  assert.equal(gap.persisted, true);
  assert.equal(gap.result.reason, "stream_gap");
  assert.equal(filled.result.applied, true);
  assert.equal(retried.result.applied, true);
  assert.equal(runtime.getState().streamSequences.s, 3);
});

test("same-runtime concurrent commits run in call order", async () => {
  const runtime = createChatRuntime();
  const gate = deferred();
  const order = [];
  let started = 0;
  const persistence = {
    async append(event) {
      started += 1;
      if (event.id === "one") await gate.promise;
      order.push(event.id);
    },
  };

  const first = commitChatEvent(runtime, persistence, usage("one", 1));
  const second = commitChatEvent(runtime, persistence, usage("two", 2));
  await waitUntil(() => started === 1);
  assert.equal(started, 1);
  assert.deepEqual(order, []);
  gate.resolve();
  const [firstResult, secondResult] = await Promise.all([first, second]);

  assert.equal(firstResult.ok, true);
  assert.equal(secondResult.ok, true);
  assert.deepEqual(order, ["one", "two"]);
  assert.equal(runtime.getState().streamSequences.s, 2);
});

test("a rejected queue item does not poison later commits", async () => {
  const runtime = createChatRuntime();
  let calls = 0;
  const persistence = {
    async append(event) {
      calls += 1;
      if (event.id === "one") throw new Error("first failed");
    },
  };
  const first = commitChatEvent(runtime, persistence, usage("one", 1));
  const second = commitChatEvent(runtime, persistence, usage("two", 1));
  const [firstResult, secondResult] = await Promise.all([first, second]);

  assert.equal(firstResult.ok, false);
  assert.equal(firstResult.reason, "append_failed");
  assert.equal(secondResult.ok, true);
  assert.equal(secondResult.result.applied, true);
  assert.equal(calls, 2);
  assert.deepEqual(runtime.getState().seenEventIds, ["two"]);
});

test("snapshot helper fails for unknown threads and missing cursors without inventing zero", () => {
  const empty = createThreadSnapshotEvent({
    state: createInitialChatState(),
    threadId: "thread-1",
    id: "snap",
    source: "test",
    occurredAt: ISO,
    streamId: "s",
  });
  assert.equal(empty.ok, false);
  assert.equal(empty.reason, "unknown_thread");

  const withThread = reduceChatEvent(
    createInitialChatState(),
    chatEvent("thread.upsert", baseThread(), { id: "thread" }),
  ).state;
  const missingCursor = createThreadSnapshotEvent({
    state: withThread,
    threadId: "thread-1",
    id: "snap",
    source: "test",
    occurredAt: ISO,
    streamId: "s",
  });
  assert.equal(missingCursor.ok, false);
  assert.equal(missingCursor.reason, "missing_cursor");
});

test("snapshot helper selects only the requested thread and uses the existing stream high-water", () => {
  const state = replayChatEvents([
    chatEvent("thread.upsert", baseThread(), { id: "t1", streamId: "s", sequence: 1 }),
    chatEvent("turn.upsert", baseTurn(), { id: "turn", streamId: "s", sequence: 2 }),
    chatEvent("item.upsert", baseItem({ text: "hello" }), { id: "item", streamId: "s", sequence: 3 }),
    chatEvent("surface.upsert", baseSurface(), { id: "surface", streamId: "s", sequence: 4 }),
    chatEvent("interaction.requested", baseInteraction(), { id: "ix", streamId: "s", sequence: 5 }),
    chatEvent("usage.updated", { totalTokens: 9 }, { id: "usage", streamId: "s", sequence: 6 }),
    chatEvent("thread.upsert", baseThread({ id: "thread-2", title: "other" }), {
      id: "t2",
      threadId: "thread-2",
      streamId: "s2",
      sequence: 1,
    }),
    chatEvent("turn.upsert", baseTurn({ id: "turn-2", threadId: "thread-2" }), {
      id: "turn-2",
      threadId: "thread-2",
      turnId: "turn-2",
      streamId: "s2",
      sequence: 2,
    }),
    chatEvent("item.upsert", baseItem({ id: "item-2", threadId: "thread-2", turnId: "turn-2" }), {
      id: "item-2",
      threadId: "thread-2",
      turnId: "turn-2",
      streamId: "s2",
      sequence: 3,
    }),
    chatEvent("interaction.requested", baseInteraction({ id: "ix-2", threadId: "thread-2", turnId: "turn-2" }), {
      id: "ix-2",
      threadId: "thread-2",
      turnId: "turn-2",
      streamId: "s2",
      sequence: 4,
    }),
    chatEvent("usage.updated", { totalTokens: 4 }, { id: "usage-2", threadId: "thread-2", streamId: "s2", sequence: 5 }),
  ]);

  const created = createThreadSnapshotEvent({
    state,
    threadId: "thread-1",
    id: "snap-1",
    source: "lab",
    occurredAt: ISO,
    streamId: "s",
  });
  assert.equal(created.ok, true);
  assert.equal(created.event.type, "thread.snapshot");
  assert.deepEqual(created.event.stream, { id: "s", sequence: 6 });
  assert.equal(created.event.payload.thread.id, "thread-1");
  assert.deepEqual(created.event.payload.turns.map((turn) => turn.id), ["turn-1"]);
  assert.deepEqual(created.event.payload.items.map((item) => item.id), ["item-1"]);
  assert.deepEqual(created.event.payload.surfaces.map((surface) => surface.id), ["surface-1"]);
  assert.deepEqual(created.event.payload.interactions.map((interaction) => interaction.id), ["interaction-1"]);
  assert.equal(created.event.payload.interactions[0].status, "pending");
  assert.deepEqual(created.event.payload.usage, { totalTokens: 9 });
  assert.equal(created.event.payload.turns.some((turn) => turn.threadId === "thread-2"), false);
});

test("empty hydration yields a quiet runtime", async () => {
  const persistence = createMemoryChatPersistence();
  const hydrated = await hydrateChatRuntime(persistence, { threadId: "thread-1", limit: 16 });
  assert.equal(hydrated.ok, true);
  assert.equal(hydrated.incomplete, false);
  assert.deepEqual(hydrated.resyncRequests, {});
  assert.deepEqual(hydrated.runtime.getState(), createInitialChatState());

  let calls = 0;
  hydrated.runtime.subscribe(() => {
    calls += 1;
  });
  assert.equal(calls, 0);
});

test("snapshot plus tail hydrates from the envelope cursor", async () => {
  const persistence = createMemoryChatPersistence();
  const prefix = [
    chatEvent("thread.upsert", baseThread(), { id: "one", streamId: "s", sequence: 1 }),
    usage("two", 2),
    usage("three", 3),
  ];
  for (const event of prefix) await persistence.append(event);
  const live = replayChatEvents(prefix);
  const snapshot = createThreadSnapshotEvent({
    state: live,
    threadId: "thread-1",
    id: "snap",
    source: "test",
    occurredAt: ISO,
    streamId: "s",
  });
  assert.equal(snapshot.ok, true);
  await persistence.saveSnapshot(snapshot.event);
  await persistence.append(usage("four", 4));
  await persistence.append(usage("five", 5));

  const hydrated = await hydrateChatRuntime(persistence, { threadId: "thread-1", streamId: "s", limit: 2 });
  assert.equal(hydrated.ok, true);
  assert.equal(hydrated.incomplete, false);
  assert.equal(hydrated.runtime.getState().usageByThread["thread-1"].totalTokens, 5);
  assert.equal(hydrated.runtime.getState().streamSequences.s, 5);
  assert.deepEqual(hydrated.runtime.getState().seenEventIds, ["snap", "four", "five"]);
});

test("a later high-water snapshot recovers a journal gap during hydration", async () => {
  const journal = createMemoryChatPersistence();
  await journal.append(usage("one", 1));
  await journal.append(usage("three", 3));
  await journal.append(chatEvent("thread.snapshot", snapshotPayload({
    usage: { totalTokens: 10 },
  }), { id: "recover", streamId: "s", sequence: 10 }));
  await journal.append(usage("eleven", 11));
  const persistence = {
    async loadSnapshot() {
      return undefined;
    },
    readJournal: (query) => journal.readJournal(query),
  };

  const hydrated = await hydrateChatRuntime(persistence, { threadId: "thread-1", limit: 8 });
  assert.equal(hydrated.ok, true);
  assert.equal(hydrated.incomplete, false);
  assert.deepEqual(hydrated.resyncRequests, {});
  assert.equal(hydrated.runtime.getState().streamSequences.s, 11);
  assert.equal(hydrated.runtime.getState().threads["thread-1"].title, "snap");
});

test("leftover gaps are copied onto the hydrate result and snapshot without stream does not clear them", async () => {
  const journal = createMemoryChatPersistence();
  await journal.append(usage("one", 1));
  await journal.append(usage("three", 3));
  await journal.append(chatEvent("thread.snapshot", snapshotPayload(), { id: "no-stream", turnId: null }));
  const persistence = {
    async loadSnapshot() {
      return undefined;
    },
    readJournal: (query) => journal.readJournal(query),
  };

  const hydrated = await hydrateChatRuntime(persistence, { threadId: "thread-1", limit: 8 });
  assert.equal(hydrated.ok, true);
  assert.equal(hydrated.incomplete, true);
  assert.deepEqual(hydrated.resyncRequests.s, {
    streamId: "s",
    expectedSequence: 2,
    receivedSequence: 3,
    eventId: "three",
  });
  hydrated.resyncRequests.s.expectedSequence = 99;
  assert.equal(hydrated.runtime.getState().resyncRequests.s.expectedSequence, 2);
  assert.equal(hydrated.runtime.getState().threads["thread-1"].title, "snap");
  assert.equal(hydrated.runtime.getState().streamSequences.s, 1);
});

test("envelope poison fails closed", async () => {
  const persistence = {
    async loadSnapshot() {
      return undefined;
    },
    async readJournal() {
      return {
        events: [{ protocolVersion: 1, id: "bad", type: "usage.updated" }],
        done: true,
      };
    },
  };
  const hydrated = await hydrateChatRuntime(persistence, { threadId: "thread-1", limit: 8 });
  assert.equal(hydrated.ok, false);
  assert.equal(hydrated.reason, "invalid_event");
});

test("foreign snapshots and threads are rejected", async () => {
  const foreign = chatEvent("thread.snapshot", {
    thread: baseThread({ id: "thread-2" }),
    turns: [],
    items: [],
    surfaces: [],
    interactions: [],
  }, { id: "foreign", threadId: "thread-2", turnId: null, streamId: "s", sequence: 1 });
  const persistence = {
    async loadSnapshot() {
      return foreign;
    },
    async readJournal() {
      return { events: [], done: true };
    },
  };
  const hydrated = await hydrateChatRuntime(persistence, { threadId: "thread-1", limit: 8 });
  assert.equal(hydrated.ok, false);
  assert.equal(hydrated.reason, "foreign_snapshot");

  const otherStream = chatEvent("thread.snapshot", snapshotPayload(), {
    id: "other-stream",
    turnId: null,
    streamId: "other",
    sequence: 4,
  });
  const streamMismatch = await hydrateChatRuntime({
    async loadSnapshot() {
      return otherStream;
    },
    async readJournal() {
      return { events: [], done: true };
    },
  }, { threadId: "thread-1", streamId: "s", limit: 8 });
  assert.equal(streamMismatch.ok, false);
  assert.equal(streamMismatch.reason, "foreign_snapshot");
});

test("hydrate contains snapshot and journal read failures", async () => {
  const snapshotError = new Error("snapshot unavailable");
  const snapshotFailure = await hydrateChatRuntime({
    async loadSnapshot() {
      throw snapshotError;
    },
    async readJournal() {
      assert.fail("journal must not be read after snapshot failure");
    },
  }, { threadId: "thread-1", limit: 8 });
  assert.equal(snapshotFailure.ok, false);
  assert.equal(snapshotFailure.reason, "load_failed");
  assert.strictEqual(snapshotFailure.error, snapshotError);

  const journalError = new Error("journal unavailable");
  const journalFailure = await hydrateChatRuntime({
    async loadSnapshot() {},
    async readJournal() {
      throw journalError;
    },
  }, { threadId: "thread-1", limit: 8 });
  assert.equal(journalFailure.ok, false);
  assert.equal(journalFailure.reason, "load_failed");
  assert.strictEqual(journalFailure.error, journalError);
});

test("memory persistence keeps snapshots distinct by thread and stream", async () => {
  const persistence = createMemoryChatPersistence();
  const first = chatEvent("thread.snapshot", snapshotPayload({ usage: { totalTokens: 1 } }), {
    id: "snapshot-s1",
    streamId: "s1",
    sequence: 1,
  });
  const second = chatEvent("thread.snapshot", snapshotPayload({ usage: { totalTokens: 2 } }), {
    id: "snapshot-s2",
    streamId: "s2",
    sequence: 2,
  });
  await persistence.saveSnapshot(first);
  await persistence.saveSnapshot(second);

  const loadedFirst = await persistence.loadSnapshot({ threadId: "thread-1", streamId: "s1" });
  const loadedSecond = await persistence.loadSnapshot({ threadId: "thread-1", streamId: "s2" });
  const loadedLatest = await persistence.loadSnapshot({ threadId: "thread-1" });
  assert.strictEqual(loadedFirst, first);
  assert.strictEqual(loadedSecond, second);
  assert.strictEqual(loadedLatest, second);
});

test("hydrate filters events that explicitly belong to another stream", async () => {
  const persistence = createMemoryChatPersistence();
  await persistence.append(usage("s1-one", 1, 1, { streamId: "s1" }));
  await persistence.append(chatEvent("usage.updated", { totalTokens: 50 }, {
    id: "s2-one",
    threadId: "thread-1",
    streamId: "s2",
    sequence: 1,
  }));
  await persistence.append(usage("s1-two", 2, 2, { streamId: "s1" }));
  await persistence.append(chatEvent("usage.updated", { totalTokens: 7 }, { id: "unsequenced" }));

  const hydrated = await hydrateChatRuntime(persistence, {
    threadId: "thread-1",
    streamId: "s1",
    limit: 8,
  });
  assert.equal(hydrated.ok, true);
  assert.equal(hydrated.runtime.getState().streamSequences.s1, 2);
  assert.equal(hydrated.runtime.getState().streamSequences.s2, undefined);
  assert.equal(hydrated.runtime.getState().usageByThread["thread-1"].totalTokens, 7);
});

test("malformed and non-advancing journal pages fail closed", async () => {
  const valid = usage("one", 1);
  const emptyNotDone = await hydrateChatRuntime({
    async loadSnapshot() {},
    async readJournal() {
      return { events: [], done: false, nextCursor: "c1" };
    },
  }, { threadId: "thread-1", limit: 8 });
  assert.equal(emptyNotDone.reason, "invalid_page");

  const missingCursor = await hydrateChatRuntime({
    async loadSnapshot() {},
    async readJournal() {
      return { events: [valid], done: false };
    },
  }, { threadId: "thread-1", limit: 8 });
  assert.equal(missingCursor.reason, "invalid_page");

  let pages = 0;
  const repeated = await hydrateChatRuntime({
    async loadSnapshot() {},
    async readJournal() {
      pages += 1;
      return { events: [valid], done: false, nextCursor: "same" };
    },
  }, { threadId: "thread-1", limit: 8 });
  assert.equal(repeated.reason, "invalid_page");
  assert.equal(pages, 2);

  const invalidLimit = await hydrateChatRuntime(createMemoryChatPersistence(), {
    threadId: "thread-1",
    limit: 0,
  });
  assert.equal(invalidLimit.reason, "invalid_query");
});

test("memory persistence round-trips commits through hydrate", async () => {
  const persistence = createMemoryChatPersistence();
  const runtime = createChatRuntime();
  await commitChatEvent(runtime, persistence, chatEvent("thread.upsert", baseThread(), {
    id: "thread",
    streamId: "s",
    sequence: 1,
  }));
  await commitChatEvent(runtime, persistence, chatEvent("interaction.requested", baseInteraction(), {
    id: "ix",
    streamId: "s",
    sequence: 2,
  }));
  await commitChatEvent(runtime, persistence, usage("three", 3));

  const hydrated = await hydrateChatRuntime(persistence, { threadId: "thread-1", limit: 2 });
  assert.equal(hydrated.ok, true);
  assert.deepEqual(hydrated.runtime.getState(), runtime.getState());
  assert.equal(hydrated.runtime.getState().interactions["interaction-1"].status, "pending");
});

test("10,000-event hydration matches deterministic replay", async () => {
  const events = Array.from({ length: 10_000 }, (_, index) =>
    usage(`usage-${index + 1}`, index + 1),
  );
  const persistence = createMemoryChatPersistence();
  for (const event of events) await persistence.append(event);

  const hydrated = await hydrateChatRuntime(persistence, {
    threadId: "thread-1",
    streamId: "s",
    limit: 256,
  });
  const replayed = replayChatEvents(events);

  assert.equal(hydrated.ok, true);
  assert.equal(hydrated.incomplete, false);
  assert.deepEqual(hydrated.runtime.getState(), replayed);
  assert.equal(hydrated.runtime.getState().usageByThread["thread-1"].totalTokens, 10_000);
});

test("runtime and persistence source have no fetch, storage, or provider client", () => {
  const source = [
    readFileSync(path.join(srcDir, "runtime.ts"), "utf8"),
    readFileSync(path.join(srcDir, "persistence.ts"), "utf8"),
  ].join("\n");
  for (const pattern of [
    "fetch(",
    "XMLHttpRequest",
    "indexedDB",
    "localStorage",
    "sessionStorage",
    "WebSocket",
    "createClient",
    "redis",
    "mongodb",
    "postgres",
    "sqlite",
    "from \"node:fs\"",
    "from \"node:net\"",
    "from \"node:http\"",
    "from \"node:https\"",
    "process.env",
    "openai",
    "anthropic",
    "from \"./adapters",
  ]) {
    assert.equal(source.includes(pattern), false, pattern);
  }
});
