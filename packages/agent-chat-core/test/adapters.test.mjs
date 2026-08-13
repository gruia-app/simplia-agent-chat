import assert from "node:assert/strict";
import test from "node:test";

import {
  codexAppServerAdapter,
  createOpenAiCompatibleAdapter,
  langChainAdapter,
  openRouterAdapter,
  replayChatEvents,
} from "../dist/index.js";
import { context, ISO } from "./helpers.mjs";

function only(adapter, input, overrides = {}) {
  const events = adapter.normalize(input, context(overrides));
  assert.equal(events.length, 1);
  return events[0];
}

test("Codex maps thread and turn lifecycle with native provider identity", () => {
  const thread = only(codexAppServerAdapter, {
    method: "thread/started",
    params: { thread: { id: "native-thread", name: "Research" } },
  }, { turnId: undefined });
  assert.equal(thread.type, "thread.upsert");
  assert.deepEqual(thread.payload, {
    id: "thread-1",
    appKey: "test-app",
    organizationId: "org-1",
    title: "Research",
    status: "active",
    provider: { provider: "codex", nativeThreadId: "native-thread" },
    metadata: { nativeThread: { id: "native-thread", name: "Research" } },
  });

  const started = only(codexAppServerAdapter, {
    method: "turn/started",
    params: { threadId: "native-thread", turn: { id: "native-turn" } },
  });
  assert.equal(started.type, "turn.upsert");
  assert.equal(started.turnId, "native-turn");
  assert.equal(started.payload.id, "native-turn");
  assert.equal(started.payload.status, "running");
  assert.deepEqual(started.payload.provider, {
    provider: "codex",
    nativeThreadId: "native-thread",
    nativeTurnId: "native-turn",
  });

  for (const [native, expected] of [
    ["completed", "completed"],
    ["failed", "failed"],
    ["interrupted", "interrupted"],
    ["cancelled", "cancelled"],
    ["waitingOnApproval", "waiting_approval"],
    ["waitingOnUserInput", "waiting_input"],
    ["novel", "running"],
  ]) {
    const completed = only(codexAppServerAdapter, {
      method: "turn/completed",
      params: { turn: { id: "native-turn", status: native }, error: native === "failed" ? "boom" : undefined },
    });
    assert.equal(completed.payload.status, expected, native);
    assert.equal(completed.turnId, "native-turn");
    if (native === "failed") assert.equal(completed.payload.error, "boom");
  }
});

test("Codex covers every documented item family and preserves native data", () => {
  const kinds = new Map([
    ["userMessage", "message"],
    ["agentMessage", "message"],
    ["reasoning", "reasoning"],
    ["plan", "plan"],
    ["commandExecution", "command"],
    ["fileChange", "file_change"],
    ["mcpToolCall", "tool"],
    ["dynamicToolCall", "tool"],
    ["collabAgentToolCall", "subagent"],
    ["subAgentActivity", "subagent"],
    ["webSearch", "system"],
    ["imageView", "system"],
    ["imageGeneration", "system"],
    ["review", "system"],
    ["compaction", "system"],
    ["futureItem", "unknown"],
  ]);

  let sequence = 1;
  for (const [nativeType, kind] of kinds) {
    const item = {
      id: `item-${sequence}`,
      type: nativeType,
      status: sequence % 2 ? "completed" : "pending",
      content: [{ text: "one" }, { content: "two" }],
      command: "pnpm test",
      name: "search",
      input: { query: "x" },
      result: { ok: true },
    };
    const event = only(codexAppServerAdapter, { method: "item/completed", params: { item } }, { sequence });
    assert.equal(event.type, "item.upsert");
    assert.equal(event.payload.kind, kind, nativeType);
    assert.equal(event.payload.text, "one\ntwo");
    assert.equal(event.payload.status, sequence % 2 ? "completed" : "pending");
    assert.equal(event.payload.metadata.nativeType, nativeType);
    assert.deepEqual(event.payload.metadata.native, item);
    if (nativeType === "userMessage") assert.equal(event.payload.role, "user");
    if (nativeType === "agentMessage") assert.equal(event.payload.role, "assistant");
    sequence += 1;
  }

  const failed = only(codexAppServerAdapter, {
    method: "item/completed",
    params: { item: { id: "failed", type: "commandExecution", status: "failed", error: "denied" } },
  });
  assert.equal(failed.payload.isError, true);
  assert.equal(failed.payload.output, "denied");
});

test("Codex maps all streaming delta methods and ignores empty deltas", () => {
  const methods = new Map([
    ["item/agentMessage/delta", ["text", "text"]],
    ["item/plan/delta", ["text", "text"]],
    ["item/reasoning/summaryTextDelta", ["text", "text"]],
    ["item/reasoning/textDelta", ["text", "text"]],
    ["item/commandExecution/outputDelta", ["output", "output"]],
    ["item/fileChange/outputDelta", ["output", "output"]],
  ]);
  let sequence = 1;
  for (const [method, [label, field]] of methods) {
    const event = only(codexAppServerAdapter, {
      method,
      params: { turnId: "native-turn", itemId: `item-${sequence}`, delta: `${label}-${sequence}` },
    }, { sequence });
    assert.equal(event.type, "item.delta");
    assert.equal(event.payload.itemId, `item-${sequence}`);
    assert.equal(event.payload.delta, `${label}-${sequence}`);
    assert.equal(event.payload.field, field);
    sequence += 1;
  }
  assert.deepEqual(codexAppServerAdapter.normalize({
    method: "item/agentMessage/delta",
    params: { itemId: "empty", delta: "" },
  }, context()), []);
});

test("Codex maps plan/diff surfaces with revisions", () => {
  for (const [method, kind] of [["turn/plan/updated", "acv2.plan"], ["turn/diff/updated", "acv2.diff"]]) {
    const event = only(codexAppServerAdapter, {
      method,
      params: { turnId: "native-turn", revision: 7, entries: [{ id: 1 }] },
    });
    assert.equal(event.type, "surface.upsert");
    assert.equal(event.payload.id, `${kind}:native-turn`);
    assert.equal(event.payload.kind, kind);
    assert.equal(event.payload.revision, 7);
    assert.deepEqual(event.payload.payload.entries, [{ id: 1 }]);
  }
});

test("Codex maps approvals, questions, elicitation and resolution", () => {
  const requests = [
    ["item/commandExecution/requestApproval", "approval"],
    ["item/fileChange/requestApproval", "approval"],
    ["item/permissions/requestApproval", "approval"],
    ["applyPatchApproval", "approval"],
    ["execCommandApproval", "approval"],
    ["item/tool/requestUserInput", "question"],
    ["mcpServer/elicitation/request", "elicitation"],
  ];
  let id = 1;
  for (const [method, kind] of requests) {
    const event = only(codexAppServerAdapter, {
      id,
      method,
      params: {
        turnId: "native-turn",
        itemId: "item-1",
        reason: "Need a decision",
        availableDecisions: ["accept", "decline"],
      },
    }, { sequence: id });
    assert.equal(event.type, "interaction.requested");
    assert.equal(event.payload.id, `codex-request:${id}`);
    assert.equal(event.payload.kind, kind, method);
    assert.deepEqual(event.payload.availableDecisions, ["accept", "decline"]);
    id += 1;
  }

  const resolved = only(codexAppServerAdapter, {
    method: "serverRequest/resolved",
    params: { requestId: 3 },
  });
  assert.equal(resolved.type, "interaction.resolved");
  assert.equal(resolved.payload.interactionId, "codex-request:3");
  assert.equal(resolved.payload.resolvedAt, ISO);
});

test("Codex maps usage and warning variants, and ignores unknown messages", () => {
  const usage = only(codexAppServerAdapter, {
    method: "thread/tokenUsage/updated",
    params: { tokenUsage: { total: { inputTokens: 10, outputTokens: 20, totalTokens: 30 } } },
  });
  assert.equal(usage.type, "usage.updated");
  assert.deepEqual(usage.payload, { inputTokens: 10, outputTokens: 20, totalTokens: 30 });

  for (const method of ["warning", "error", "guardianWarning", "configWarning"]) {
    const warning = only(codexAppServerAdapter, { method, params: { message: "careful", extra: true } });
    assert.equal(warning.type, "warning");
    assert.equal(warning.payload.code, method);
    assert.equal(warning.payload.message, "careful");
  }
  assert.deepEqual(codexAppServerAdapter.normalize({ method: "future/notification", params: {} }, context()), []);
  assert.deepEqual(codexAppServerAdapter.normalize({ params: {} }, context()), []);
});

test("LangChain messages mode streams mixed content and emits tool calls", () => {
  const events = langChainAdapter.normalize({
    mode: "messages",
    data: [{
      id: "ai-1",
      content: [{ text: "hello " }, { content: "world" }],
      tool_calls: [{ id: "call-1", name: "search", args: { q: "Madrid" } }],
    }, { node: "agent" }],
  }, context());
  assert.equal(events.length, 2);
  assert.equal(events[0].type, "item.delta");
  assert.equal(events[0].payload.delta, "hello world");
  assert.equal(events[0].provider.raw.mode, "messages");
  assert.deepEqual(events[0].provider.raw.metadata, { node: "agent" });
  assert.equal(events[1].type, "item.upsert");
  assert.equal(events[1].payload.toolName, "search");
  assert.deepEqual(events[1].payload.input, { q: "Madrid" });
});

test("LangChain updates mode maps human, AI and tool messages", () => {
  const events = langChainAdapter.normalize({
    mode: "updates",
    data: {
      agent: { messages: [
        { id: "h", type: "human", content: "question" },
        { id: "a", type: "ai", text: "answer", tool_calls: [{ name: "x" }] },
        { id: "t", type: "tool", name: "search", content: "result" },
      ] },
    },
  }, context());
  assert.equal(events.length, 3);
  assert.deepEqual(events.map((event) => event.payload.role), ["user", "assistant", "tool"]);
  assert.deepEqual(events.map((event) => event.payload.kind), ["message", "message", "tool"]);
  assert.equal(events[2].payload.toolName, "search");
  assert.deepEqual(events[1].payload.output, [{ name: "x" }]);
});

test("LangChain custom and event modes cover surfaces, stream/end/error", () => {
  const custom = only(langChainAdapter, { mode: "custom", name: "data.chart", data: { series: [1, 2] } });
  assert.equal(custom.type, "surface.upsert");
  assert.equal(custom.payload.kind, "data.chart");
  assert.deepEqual(custom.payload.payload, { series: [1, 2] });

  const stream = only(langChainAdapter, {
    mode: "events", event: "on_chat_model_stream", data: { chunk: { content: [{ text: "token" }] } },
  });
  assert.equal(stream.type, "item.delta");
  assert.equal(stream.payload.delta, "token");

  const end = only(langChainAdapter, { event: "on_chain_end", data: {} });
  assert.equal(end.type, "turn.status");
  assert.equal(end.payload.status, "completed");

  const error = only(langChainAdapter, { mode: "events", event: "on_chain_error", data: { message: "broken" } });
  assert.equal(error.payload.status, "failed");
  assert.equal(error.payload.error, "broken");
  assert.deepEqual(langChainAdapter.normalize({ mode: "events", event: "on_chain_start", data: {} }, context()), []);
});

test("OpenAI-compatible and OpenRouter adapters stream text, finish and usage", () => {
  const adapter = createOpenAiCompatibleAdapter({ id: "custom", provider: "fallback" });
  assert.equal(adapter.id, "custom");
  const events = adapter.normalize({
    id: "chunk-1",
    model: "model-1",
    provider: "upstream",
    choices: [{ index: 0, delta: { content: "hello" }, finish_reason: "stop" }],
    usage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7, cost: 0.01 },
  }, context());
  assert.deepEqual(events.map((event) => event.type), ["item.delta", "turn.status", "usage.updated"]);
  assert.equal(events[0].payload.delta, "hello");
  assert.deepEqual(events[0].provider, { provider: "upstream", model: "model-1" });
  assert.equal(events[1].payload.status, "completed");
  assert.deepEqual(events[2].payload, { inputTokens: 3, outputTokens: 4, totalTokens: 7, costUsd: 0.01 });
  assert.equal(openRouterAdapter.id, "openrouter-chat-completions-v1");
  assert.equal(only(openRouterAdapter, "[DONE]").provider.provider, "openrouter");
});

test("OpenAI-compatible maps provider errors and non-success finish reasons", () => {
  const adapter = createOpenAiCompatibleAdapter();
  const errorEvents = adapter.normalize({ error: { code: "rate_limit", message: "slow down" } }, context());
  assert.deepEqual(errorEvents.map((event) => event.type), ["warning", "turn.status"]);
  assert.deepEqual(errorEvents[0].payload, {
    code: "rate_limit", message: "slow down", detail: { code: "rate_limit", message: "slow down" },
  });
  assert.equal(errorEvents[1].payload.status, "failed");

  const finish = only(adapter, { choices: [{ delta: {}, finish_reason: "length" }] });
  assert.equal(finish.payload.status, "failed");
  assert.equal(finish.payload.error, "finish_reason:length");
  assert.equal(only(adapter, "[DONE]").payload.status, "completed");
});

test("OpenAI-compatible accepts non-streaming message tool calls", () => {
  const adapter = createOpenAiCompatibleAdapter();
  const events = adapter.normalize({
    id: "response",
    choices: [{
      message: {
        content: "done",
        tool_calls: [{ id: "call-1", type: "function", function: { name: "weather", arguments: "{\"city\":\"Madrid\"}" } }],
      },
      finish_reason: "tool_calls",
    }],
  }, context());
  assert.deepEqual(events.map((event) => event.type), ["item.delta", "item.upsert", "turn.status"]);
  assert.equal(events[1].payload.toolName, "weather");
  assert.deepEqual(events[1].payload.input, { toolCallId: "call-1", arguments: "{\"city\":\"Madrid\"}" });
  assert.equal(events[1].payload.status, "completed");
});

test("OpenAI-compatible fragmented tool calls accumulate identity, name and arguments across replay", () => {
  const adapter = createOpenAiCompatibleAdapter();
  const first = adapter.normalize({
    id: "chunk-a",
    choices: [{ delta: { tool_calls: [{ index: 0, id: "call-1", function: { name: "weather", arguments: "{\"city\":" } }] } }],
  }, context({ sequence: 1 }));
  const second = adapter.normalize({
    id: "chunk-b",
    choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: "\"Madrid\"}" } }] }, finish_reason: "tool_calls" }],
  }, context({ sequence: 2 }));
  const state = replayChatEvents([...first, ...second]);
  const item = state.items["tool:turn-1:0:0"];
  assert.equal(item.toolName, "weather");
  assert.deepEqual(item.input, { toolCallId: "call-1", arguments: "{\"city\":\"Madrid\"}" });
  assert.equal(item.status, "completed");
});
