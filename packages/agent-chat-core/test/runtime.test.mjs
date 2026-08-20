import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

import {
  createChatRuntime,
  createInitialChatState,
  reduceChatEvent,
} from "../dist/index.js";
import { createChatRuntime as createChatRuntimeFromSubpath } from "../dist/runtime.js";
import { chatEvent } from "./helpers.mjs";

const srcDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src");

function usage(id, sequence, totalTokens = sequence, streamId = "s") {
  return chatEvent("usage.updated", { totalTokens }, { id, streamId, sequence });
}

test("runtime subpath export matches the core index export", () => {
  assert.equal(createChatRuntimeFromSubpath, createChatRuntime);
});

test("apply matches reduceChatEvent and preserves reducer reference identity", () => {
  const initial = createInitialChatState();
  const runtime = createChatRuntime({ initialState: initial });
  const independent = createInitialChatState();
  const event = usage("one", 1);

  const runtimeResult = runtime.apply(event);
  const reduced = reduceChatEvent(independent, event);

  assert.deepEqual(runtimeResult, reduced);
  assert.equal(runtimeResult.applied, true);
  assert.strictEqual(runtime.getState(), runtimeResult.state);
  assert.notStrictEqual(runtime.getState(), initial);

  const duplicate = runtime.apply(event);
  const reducedDuplicate = reduceChatEvent(reduced.state, event);
  assert.equal(duplicate.applied, false);
  assert.equal(duplicate.reason, "duplicate");
  assert.strictEqual(duplicate.state, runtimeResult.state);
  assert.strictEqual(reducedDuplicate.state, reduced.state);
  assert.deepEqual(duplicate, reducedDuplicate);
});

test("subscribe does not emit immediately and unsubscribing is idempotent", () => {
  const runtime = createChatRuntime();
  let calls = 0;
  const unsubscribe = runtime.subscribe(() => {
    calls += 1;
  });

  assert.equal(calls, 0);
  unsubscribe();
  unsubscribe();
  runtime.apply(usage("one", 1));
  assert.equal(calls, 0);
});

test("notifies only when the state reference changes", () => {
  const runtime = createChatRuntime();
  const seen = [];
  runtime.subscribe(() => {
    seen.push(runtime.getState().streamSequences.s);
  });

  const first = runtime.apply(usage("one", 1, 1));
  const gap = runtime.apply(usage("three", 3, 3));
  const stale = runtime.apply(usage("one-stale", 1, 9));
  const invalid = runtime.apply(null);
  const conflictState = runtime.getState();
  const conflict = runtime.apply({
    ...chatEvent("surface.upsert", {
      id: "surface-1",
      threadId: "thread-1",
      kind: "data.table",
      schemaVersion: 1,
      revision: 1,
      status: "ready",
      payload: {},
    }, { id: "surface-ok" }),
  });
  const staleSurface = runtime.apply(chatEvent("surface.upsert", {
    id: "surface-1",
    threadId: "thread-1",
    kind: "data.table",
    schemaVersion: 1,
    revision: 0,
    status: "ready",
    payload: {},
  }, { id: "surface-stale" }));

  assert.equal(first.applied, true);
  assert.equal(gap.applied, false);
  assert.equal(gap.reason, "stream_gap");
  assert.notStrictEqual(gap.state, first.state);
  assert.equal(stale.reason, "stale_stream_event");
  assert.strictEqual(stale.state, gap.state);
  assert.equal(invalid.reason, "invalid_event");
  assert.strictEqual(invalid.state, gap.state);
  assert.equal(conflict.applied, true);
  assert.equal(staleSurface.applied, false);
  assert.equal(staleSurface.reason, "surface_conflict");
  assert.strictEqual(staleSurface.state, conflict.state);
  assert.notStrictEqual(conflict.state, conflictState);
  assert.deepEqual(seen, [1, 1, 1]);
});

test("listeners subscribed during notify are a later generation", () => {
  const runtime = createChatRuntime();
  let nestedCalls = 0;
  runtime.subscribe(() => {
    runtime.subscribe(() => {
      nestedCalls += 1;
    });
  });

  runtime.apply(usage("one", 1));
  assert.equal(nestedCalls, 0);
  runtime.apply(usage("two", 2));
  assert.equal(nestedCalls, 1);
});

test("throwing listeners do not change ReduceResult or block later listeners", () => {
  const runtime = createChatRuntime();
  const errors = [];
  const order = [];
  const boom = new Error("listener-boom");
  const hookBoom = new Error("hook-boom");
  const isolated = createChatRuntime({
    onListenerError(error) {
      errors.push(error);
      throw hookBoom;
    },
  });

  isolated.subscribe(() => {
    order.push("first");
    throw boom;
  });
  isolated.subscribe(() => {
    order.push("second");
  });

  const result = isolated.apply(usage("one", 1));
  const expected = reduceChatEvent(createInitialChatState(), usage("one", 1));

  assert.deepEqual(result, expected);
  assert.deepEqual(order, ["first", "second"]);
  assert.deepEqual(errors, [boom]);
  assert.doesNotThrow(() => runtime.apply(usage("two", 1)));
});

test("listener errors without a hook stay contained inside apply", () => {
  const runtime = createChatRuntime();
  runtime.subscribe(() => {
    throw new Error("no-hook");
  });
  const result = runtime.apply(usage("one", 1));
  assert.equal(result.applied, true);
  assert.equal(result.state.usageByThread["thread-1"].totalTokens, 1);
});

test("initial state is adopted by reference and untrusted input matches the reducer", () => {
  const initial = createInitialChatState();
  const runtime = createChatRuntime({ initialState: initial });
  assert.strictEqual(runtime.getState(), initial);

  for (const candidate of [undefined, null, "event", { type: "warning" }]) {
    const result = runtime.apply(candidate);
    const reduced = reduceChatEvent(initial, candidate);
    assert.deepEqual(result, reduced);
    assert.equal(result.applied, false);
    assert.strictEqual(result.state, initial);
  }
});

test("runtime source has no fetch, storage, or provider client", () => {
  const source = readFileSync(path.join(srcDir, "runtime.ts"), "utf8");
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
    "langchain",
  ]) {
    assert.equal(source.includes(pattern), false, pattern);
  }
});
