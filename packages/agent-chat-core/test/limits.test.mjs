import assert from "node:assert/strict";
import test from "node:test";

import {
  collectUsageMeterEvents,
  createChatRuntime,
  diffChatUsage,
  normalizeChatLimitNotice,
  replayChatEvents,
  watchChatUsage,
} from "../dist/index.js";
import { baseThread, chatEvent } from "./helpers.mjs";

test("normalizeChatLimitNotice validates kind and message and freezes", () => {
  const notice = normalizeChatLimitNotice({
    kind: "quota_exceeded",
    message: "  Has agotado tu cuota mensual.  ",
    actionLabel: " Upgrade ",
    actionId: "billing.upgrade",
  });
  assert.deepEqual(notice, {
    kind: "quota_exceeded",
    message: "Has agotado tu cuota mensual.",
    actionLabel: "Upgrade",
    actionId: "billing.upgrade",
  });
  assert.ok(Object.isFrozen(notice));

  for (const bad of [
    null,
    "x",
    { message: "m" },
    { kind: "quota_exceeded" },
    { kind: "unknown", message: "m" },
    { kind: "quota_exceeded", message: "  " },
    { kind: "quota_exceeded", message: "m", actionLabel: "x".repeat(81) },
  ]) {
    assert.equal(normalizeChatLimitNotice(bad), undefined);
  }
});

test("blocking defaults to true semantics and only explicit false disables", () => {
  assert.equal(normalizeChatLimitNotice({ kind: "rate_limited", message: "m" }).blocking, undefined);
  assert.equal(
    normalizeChatLimitNotice({ kind: "rate_limited", message: "m", blocking: false }).blocking,
    false,
  );
  assert.equal(
    normalizeChatLimitNotice({ kind: "rate_limited", message: "m", blocking: 0 }).blocking,
    undefined,
  );
});

test("diffChatUsage reports per-key deltas and tolerates missing snapshots", () => {
  assert.deepEqual(diffChatUsage(undefined, undefined), {});
  assert.deepEqual(diffChatUsage(undefined, { totalTokens: 10 }), { totalTokens: 10 });
  assert.deepEqual(
    diffChatUsage({ totalTokens: 10, inputTokens: 4 }, { totalTokens: 25, inputTokens: 4 }),
    { totalTokens: 15 },
  );
  assert.deepEqual(diffChatUsage({ totalTokens: 25 }, { totalTokens: 20 }), { totalTokens: -5 });
});

function stateWithUsage(threadId, tokens) {
  return replayChatEvents([
    chatEvent("thread.upsert", baseThread({ id: threadId }), { id: `t-${threadId}`, threadId }),
    chatEvent("usage.updated", { totalTokens: tokens }, { id: `u-${threadId}-${tokens}`, threadId }),
  ]);
}

test("collectUsageMeterEvents emits one event per changed thread with tenant key", () => {
  const before = stateWithUsage("thread-1", 10);
  const after = replayChatEvents(
    [chatEvent("usage.updated", { totalTokens: 15, costUsd: 0.02 }, { id: "u2", threadId: "thread-1" })],
    before,
  );
  const events = collectUsageMeterEvents(before, after);
  assert.equal(events.length, 1);
  assert.equal(events[0].threadId, "thread-1");
  assert.equal(events[0].organizationId, "org-1");
  assert.deepEqual(events[0].delta, { totalTokens: 5, costUsd: 0.02 });
  assert.equal(events[0].usage.totalTokens, 15);
});

test("collectUsageMeterEvents skips unchanged and unknown-tenant threads", () => {
  const state = stateWithUsage("thread-1", 10);
  assert.deepEqual(collectUsageMeterEvents(state, state), []);

  const noThread = replayChatEvents([
    chatEvent("usage.updated", { totalTokens: 3 }, { id: "u-orphan", threadId: "ghost" }),
  ]);
  const events = collectUsageMeterEvents(state, noThread);
  assert.equal(events.length, 1);
  assert.equal(events[0].threadId, "ghost");
  assert.equal(events[0].organizationId, undefined);
});

test("watchChatUsage emits each applied delta in order until unsubscribed", () => {
  const runtime = createChatRuntime();
  const emitted = [];
  const unsubscribe = watchChatUsage(runtime, (event) => emitted.push(event));

  runtime.apply(chatEvent("thread.upsert", baseThread(), { id: "t1" }));
  runtime.apply(chatEvent("usage.updated", { totalTokens: 5 }, { id: "u1" }));
  runtime.apply(chatEvent("usage.updated", { outputTokens: 2 }, { id: "u2" }));
  unsubscribe();
  runtime.apply(chatEvent("usage.updated", { totalTokens: 99 }, { id: "u3" }));

  assert.equal(emitted.length, 2);
  assert.deepEqual(emitted[0].delta, { totalTokens: 5 });
  assert.deepEqual(emitted[1].delta, { outputTokens: 2 });
});
