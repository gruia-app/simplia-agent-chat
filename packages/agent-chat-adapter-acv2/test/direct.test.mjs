import assert from "node:assert/strict";
import test from "node:test";

import { acv2DirectChatAdapter } from "../dist/index.js";
import { createInitialChatState, reduceChatEvent } from "@simplia/agent-chat-core/state";

const CONTEXT = {
  source: "acv2-direct",
  threadId: "thread-1",
  appKey: "autonomous-coding-v2",
  organizationId: "org-1",
  occurredAt: "2026-08-14T08:00:00.000Z",
};

test("ACV2 direct exchange projects a complete replayable turn", () => {
  const events = acv2DirectChatAdapter.normalize({
    exchange_id: "exchange-1",
    role: "ANALYST",
    provider: "kimi_for_coding",
    model: "kimi-coding/k3",
    request: { message: "Inspect the repository" },
    response: {
      response: "Inspection complete",
      session_id: "session-native",
      conversation_id: "conversation-native",
      tokens_used: 123,
      cost_usd: 0.012,
      tool_calls: [
        { id: "tool-native", name: "Read", input: "README.md" },
        { name: "Search", input: { query: "TODO" } },
      ],
    },
  }, CONTEXT);

  assert.deepEqual(events.map((event) => event.type), [
    "turn.upsert",
    "item.upsert",
    "item.upsert",
    "item.upsert",
    "item.upsert",
    "usage.updated",
  ]);
  assert.equal(events[0].provider.provider, "kimi_for_coding");
  assert.equal(events[0].provider.nativeThreadId, "conversation-native");
  assert.equal(events[0].provider.nativeTurnId, "exchange-1");
  assert.equal(events[0].payload.id, "thread-1:exchange-1");
  assert.deepEqual(events[0].payload.itemIds, [
    "thread-1:user:exchange-1",
    "thread-1:tool:exchange-1:tool-native:0",
    "thread-1:tool:exchange-1:anonymous:1",
    "thread-1:assistant:exchange-1",
  ]);
  assert.deepEqual(events.at(-1).payload, { totalTokens: 123, costUsd: 0.012 });

  let state = createInitialChatState();
  for (const chatEvent of events) {
    const reduced = reduceChatEvent(state, chatEvent);
    assert.equal(reduced.applied, true);
    state = reduced.state;
  }
  assert.equal(state.turns["thread-1:exchange-1"].status, "completed");
  assert.equal(state.turns["thread-1:exchange-1"].provider.sessionId, "session-native");
  assert.equal(state.items["thread-1:assistant:exchange-1"].text, "Inspection complete");
  assert.equal(state.items["thread-1:tool:exchange-1:tool-native:0"].toolName, "Read");
  assert.deepEqual(state.usageByThread["thread-1"], { totalTokens: 123, costUsd: 0.012 });
});

test("ACV2 direct exchange keeps identical native ids isolated by thread", () => {
  const input = {
    exchange_id: "exchange-1",
    request: { message: "hello" },
    response: {
      response: "world",
      tool_calls: [{ id: "same-tool", name: "Read", input: "same" }],
    },
  };
  const first = acv2DirectChatAdapter.normalize(input, CONTEXT);
  const second = acv2DirectChatAdapter.normalize(input, { ...CONTEXT, threadId: "thread-2" });

  assert.equal(first[0].payload.id, "thread-1:exchange-1");
  assert.equal(second[0].payload.id, "thread-2:exchange-1");
  assert.equal(first[2].payload.id, "thread-1:tool:exchange-1:same-tool:0");
  assert.equal(second[2].payload.id, "thread-2:tool:exchange-1:same-tool:0");
});

test("ACV2 direct exchange scopes repeated native tool ids by exchange", () => {
  const makeInput = (exchangeId) => ({
    exchange_id: exchangeId,
    request: { message: exchangeId },
    response: {
      response: "done",
      tool_calls: [{ id: "call-0", name: "Read", input: "README.md" }],
    },
  });

  const first = acv2DirectChatAdapter.normalize(makeInput("exchange-1"), CONTEXT);
  const second = acv2DirectChatAdapter.normalize(makeInput("exchange-2"), CONTEXT);
  assert.equal(first[2].payload.id, "thread-1:tool:exchange-1:call-0:0");
  assert.equal(second[2].payload.id, "thread-1:tool:exchange-2:call-0:0");
  assert.notEqual(first[2].payload.id, second[2].payload.id);
});

test("ACV2 direct exchange keeps duplicate native tool ids distinct within one exchange", () => {
  const events = acv2DirectChatAdapter.normalize({
    exchange_id: "exchange-duplicate-tools",
    request: { message: "read twice" },
    response: {
      response: "done",
      tool_calls: [
        { id: "call-0", name: "Read", input: "one" },
        { id: "call-0", name: "Read", input: "two" },
      ],
    },
  }, CONTEXT);
  const toolIds = events
    .filter((event) => event.type === "item.upsert" && event.payload.kind === "tool")
    .map((event) => event.payload.id);

  assert.deepEqual(toolIds, [
    "thread-1:tool:exchange-duplicate-tools:call-0:0",
    "thread-1:tool:exchange-duplicate-tools:call-0:1",
  ]);
});

test("ACV2 direct exchange replay is idempotent", () => {
  const events = acv2DirectChatAdapter.normalize({
    exchange_id: "exchange-replay",
    request: { message: "hello" },
    response: { response: "world", tokens_used: 2 },
  }, CONTEXT);
  let state = createInitialChatState();
  for (const chatEvent of events) state = reduceChatEvent(state, chatEvent).state;
  const afterFirstReplay = state;

  for (const chatEvent of events) {
    const duplicate = reduceChatEvent(state, chatEvent);
    assert.equal(duplicate.applied, false);
    assert.equal(duplicate.reason, "duplicate");
    state = duplicate.state;
  }
  assert.strictEqual(state, afterFirstReplay);
});

test("ACV2 direct exchange rejects missing stable identity without applying content", () => {
  const events = acv2DirectChatAdapter.normalize({
    request: { message: "hello" },
    response: { response: "world" },
  }, CONTEXT);

  assert.equal(events.length, 1);
  assert.equal(events[0].type, "warning");
  assert.equal(events[0].payload.code, "acv2_direct_missing_exchange_id");
});

test("ACV2 direct exchange does not accept a leftover context turn as exchange identity", () => {
  const events = acv2DirectChatAdapter.normalize({
    request: { message: "hello" },
    response: { response: "world" },
  }, { ...CONTEXT, turnId: "leftover-turn" });

  assert.equal(events.length, 1);
  assert.equal(events[0].type, "warning");
  assert.equal(events[0].payload.code, "acv2_direct_missing_exchange_id");
});

test("ACV2 direct exchange strips one-shot stream metadata from its event batch", () => {
  const events = acv2DirectChatAdapter.normalize({
    exchange_id: "exchange-stream-context",
    request: { message: "hello" },
    response: { response: "world", tokens_used: 2 },
  }, { ...CONTEXT, streamId: "durable-stream", sequence: 7 });

  assert.equal(events.every((event) => event.stream === undefined), true);
  let state = createInitialChatState();
  for (const chatEvent of events) {
    const reduced = reduceChatEvent(state, chatEvent);
    assert.equal(reduced.applied, true);
    state = reduced.state;
  }
  assert.equal(state.items["thread-1:assistant:exchange-stream-context"].text, "world");
});

test("ACV2 direct exchange tolerates malformed request and response envelopes", () => {
  const events = acv2DirectChatAdapter.normalize({
    exchange_id: "exchange-malformed",
    request: null,
    response: null,
  }, CONTEXT);

  assert.deepEqual(events.map((event) => event.type), ["turn.upsert", "item.upsert", "item.upsert"]);
  assert.equal(events[1].payload.text, "");
  assert.equal(events[2].payload.text, "");
});

test("ACV2 direct exchange sanitizes invalid usage and tool payloads", () => {
  const events = acv2DirectChatAdapter.normalize({
    exchange_id: "exchange-2",
    request: { message: "hello" },
    response: {
      response: "world",
      tokens_used: -4.8,
      cost_usd: -1,
      tool_calls: [null, { input: "missing name" }, { name: "Read", input: () => "unsafe" }],
    },
  }, CONTEXT);

  const tool = events.find((event) => event.type === "item.upsert" && event.payload.kind === "tool");
  const usage = events.find((event) => event.type === "usage.updated");
  assert.deepEqual(tool.payload.input, null);
  assert.deepEqual(usage.payload, { totalTokens: 0, costUsd: 0 });
});
