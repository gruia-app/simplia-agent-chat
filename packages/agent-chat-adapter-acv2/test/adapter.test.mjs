import assert from "node:assert/strict";
import test from "node:test";

import {
  ACV2_DURABLE_EVENT_KINDS,
  ACV2_PROVIDER_CAPABILITIES,
  acv2PmAdapter,
  acv2ProviderCapabilities,
  isAcv2ProviderKey,
} from "../dist/index.js";
import { hasGrantedCapability, supportsFeature } from "@simplia/agent-chat-core/providers";
import { createInitialChatState, reduceChatEvent } from "@simplia/agent-chat-core/state";

const ISO = "2026-08-13T12:00:00.000Z";
const CONTEXT = {
  source: "test",
  threadId: "thread-1",
  turnId: "turn-1",
  appKey: "test-app",
  organizationId: "org-1",
  occurredAt: ISO,
};

function normalize(input, overrides = {}) {
  return acv2PmAdapter.normalize(input, { ...CONTEXT, ...overrides });
}

function only(input, overrides = {}) {
  const events = normalize(input, overrides);
  assert.equal(events.length, 1);
  return events[0];
}

function durableRunStatus(cursor, overrides = {}) {
  return only({
    cursor,
    event_kind: "run_status",
    run_id: "run-1",
    payload: { status: "RUNNING" },
  }, overrides);
}

test("ACV2 declares and normalizes every durable event family", () => {
  assert.deepEqual(ACV2_DURABLE_EVENT_KINDS, [
    "message_delta", "message_completed", "tool_use", "tool_result", "run_status", "system",
  ]);
  const inputs = [
    [{ event_kind: "message_delta", payload: { chunk: "hello" } }, "item.delta"],
    [{ event_kind: "message_completed", payload: { response: "hello world" } }, "item.upsert"],
    [{ event_kind: "tool_use", payload: { tool_use_id: "t1", tool_name: "search" } }, "item.upsert"],
    [{ event_kind: "tool_result", payload: { tool_use_id: "t1", result: { ok: true } } }, "item.upsert"],
    [{ event_kind: "run_status", payload: { status: "RUNNING" } }, "turn.status"],
    [{ event_kind: "system", payload: { message: "notice" } }, "item.upsert"],
  ];
  for (const [input, expected] of inputs) {
    assert.equal(only({ run_id: "run-1", ...input }).type, expected);
  }
});

test("ACV2 maps tools, failures and complete run status vocabulary", () => {
  const use = only({
    event_kind: "tool_use",
    run_id: "run",
    payload: { id: "call", tool: "shell", input: { command: "pwd" } },
  });
  assert.equal(use.payload.status, "streaming");
  assert.deepEqual(use.payload.input, { command: "pwd" });

  const failure = only({ event_kind: "tool_result", run_id: "run", payload: { id: "call", error: "boom" } });
  assert.equal(failure.payload.status, "failed");
  assert.equal(failure.payload.isError, true);

  for (const [native, expected] of new Map([
    ["QUEUED", "queued"], ["RUNNING", "running"], ["WAITING_INPUT", "waiting_input"],
    ["COMPLETED", "completed"], ["FAILED", "failed"], ["INTERRUPTED", "interrupted"],
    ["CANCELLED", "cancelled"], ["CANCEL_REQUESTED", "running"], ["FUTURE", "running"],
  ])) {
    assert.equal(only({ event_kind: "run_status", run_id: "run", payload: { status: native } }).payload.status, expected);
  }
});

test("ACV2 unknown durable kinds remain inspectable", () => {
  const event = only({
    cursor: 8,
    event_kind: "new_native_event",
    run_id: "run",
    payload: { event: "heartbeat", answer: 42 },
  });
  assert.equal(event.payload.kind, "system");
  assert.equal(event.payload.text, "heartbeat");
  assert.deepEqual(event.payload.metadata, { nativeEvent: "heartbeat" });
  assert.equal(event.provider.raw, undefined);
});

test("ACV2 capability matrix contains exactly the supported provider IDs", () => {
  const expected = [
    "claude", "codex_cli", "cursor_cli", "grok_cli", "gemini",
    "opencode_cli", "kimi_cli", "kilo_code", "pi_cli",
  ];
  assert.deepEqual(Object.keys(ACV2_PROVIDER_CAPABILITIES), expected);
  for (const providerId of expected) {
    assert.equal(isAcv2ProviderKey(providerId), true);
    assert.strictEqual(acv2ProviderCapabilities(providerId), ACV2_PROVIDER_CAPABILITIES[providerId]);
  }
  assert.equal(acv2ProviderCapabilities("openrouter"), undefined);
  assert.equal(acv2ProviderCapabilities("__proto__"), undefined);
});

test("ACV2 capability support and grants remain separate", () => {
  const codex = {
    providerId: "codex_cli",
    mode: "agent",
    features: ACV2_PROVIDER_CAPABILITIES.codex_cli.features,
  };
  assert.equal(supportsFeature(codex, "filesystemWrite"), "supported");
  assert.equal(hasGrantedCapability(codex, "filesystemWrite"), false);
  assert.equal(hasGrantedCapability({
    ...codex,
    grantedPermissions: { filesystemWrite: true },
  }, "filesystemWrite"), true);

  const grok = {
    providerId: "grok_cli",
    mode: "agent",
    features: ACV2_PROVIDER_CAPABILITIES.grok_cli.features,
    grantedPermissions: { filesystemWrite: true },
  };
  assert.equal(supportsFeature(grok, "filesystemWrite"), "unknown");
  assert.equal(hasGrantedCapability(grok, "filesystemWrite"), false);
});

test("ACV2 scopes native run and tool IDs by thread without collisions", () => {
  const toolInput = {
    event_kind: "tool_use",
    run_id: "run-1",
    payload: { tool_use_id: "t1", tool_name: "search" },
  };
  const first = only(toolInput, { threadId: "thread-1" });
  const second = only(toolInput, { threadId: "thread-2" });
  assert.equal(first.turnId, "thread-1:run-1");
  assert.equal(second.turnId, "thread-2:run-1");
  assert.equal(first.payload.turnId, "thread-1:run-1");
  assert.equal(second.payload.turnId, "thread-2:run-1");
  assert.equal(first.payload.id, "thread-1:t1");
  assert.equal(second.payload.id, "thread-2:t1");
  assert.notEqual(first.payload.id, second.payload.id);
  assert.equal(first.provider.nativeTurnId, "run-1");
  assert.equal(first.payload.metadata.nativeItemId, "t1");

  const alreadyScoped = only({ ...toolInput, run_id: "thread-1:run-1" }, { threadId: "thread-1" });
  assert.equal(alreadyScoped.turnId, "thread-1:run-1");
  assert.equal(alreadyScoped.payload.id, "thread-1:t1");

  const messageA = only({
    event_kind: "message_completed",
    run_id: "run-1",
    payload: { response: "hello" },
  }, { threadId: "thread-1" });
  const messageB = only({
    event_kind: "message_completed",
    run_id: "run-1",
    payload: { response: "hello" },
  }, { threadId: "thread-2" });
  assert.equal(messageA.payload.id, "thread-1:assistant:run-1");
  assert.equal(messageB.payload.id, "thread-2:assistant:run-1");

  const systemA = only({
    cursor: 8,
    event_kind: "new_native_event",
    run_id: "run-1",
    payload: { event: "heartbeat" },
  }, { threadId: "thread-1" });
  const systemB = only({
    cursor: 8,
    event_kind: "new_native_event",
    run_id: "run-1",
    payload: { event: "heartbeat" },
  }, { threadId: "thread-2" });
  assert.equal(systemA.payload.id, "thread-1:system:run-1:8:heartbeat");
  assert.equal(systemB.payload.id, "thread-2:system:run-1:8:heartbeat");
});

test("ACV2 preserves caller streamId and defaults to a scoped deterministic stream", () => {
  const caller = durableRunStatus(1, { streamId: "caller-stream" });
  assert.deepEqual(caller.stream, { id: "caller-stream", sequence: 1 });

  const first = durableRunStatus(2);
  const second = durableRunStatus(2);
  assert.deepEqual(first.stream, { id: "thread-1:durable", sequence: 2 });
  assert.deepEqual(second.stream, first.stream);
  assert.equal(first.id, second.id);

  const otherRun = durableRunStatus(2);
  const otherRunEvent = only({
    cursor: 2,
    event_kind: "run_status",
    run_id: "run-2",
    payload: { status: "RUNNING" },
  });
  assert.deepEqual(otherRunEvent.stream, { id: "thread-1:durable", sequence: 2 });
  assert.equal(otherRun.stream.id, otherRunEvent.stream.id);

  const sequenceOnly = durableRunStatus(undefined, { streamId: "caller-stream", sequence: 9 });
  assert.equal(sequenceOnly.stream, undefined);
  const noCursor = only({
    event_kind: "run_status",
    run_id: "run-1",
    payload: { status: "RUNNING" },
  }, { streamId: "caller-stream", sequence: 9 });
  assert.equal(noCursor.stream, undefined);
});

test("ACV2 accepts globally ordered cursors when durable runs interleave", () => {
  const events = [
    durableRunStatus(1),
    only({
      cursor: 2,
      event_kind: "run_status",
      run_id: "run-2",
      payload: { status: "RUNNING" },
    }),
    durableRunStatus(3),
  ];

  let state = createInitialChatState();
  for (const event of events) {
    const result = reduceChatEvent(state, event);
    assert.equal(result.applied, true);
    state = result.state;
  }
  assert.equal(state.streamSequences["thread-1:durable"], 3);
  assert.equal(state.resyncRequests["thread-1:durable"], undefined);
});

test("ACV2 durable cursors detect stream gaps, clear resync, and accept the retry", () => {
  const one = durableRunStatus(1);
  const two = durableRunStatus(2);
  const three = durableRunStatus(3);
  const streamId = one.stream.id;
  assert.equal(streamId, "thread-1:durable");
  assert.equal(two.stream.id, streamId);
  assert.equal(three.stream.id, streamId);
  assert.notEqual(one.id, three.id);

  let state = reduceChatEvent(createInitialChatState(), one).state;
  assert.equal(state.streamSequences[streamId], 1);

  const gap = reduceChatEvent(state, three);
  assert.equal(gap.applied, false);
  assert.equal(gap.reason, "stream_gap");
  assert.deepEqual(gap.state.resyncRequests[streamId], {
    streamId,
    expectedSequence: 2,
    receivedSequence: 3,
    eventId: three.id,
  });
  assert.equal(gap.state.streamSequences[streamId], 1);

  const filled = reduceChatEvent(gap.state, two);
  assert.equal(filled.applied, true);
  assert.equal(filled.state.streamSequences[streamId], 2);
  assert.equal(filled.state.resyncRequests[streamId], undefined);

  const retried = reduceChatEvent(filled.state, three);
  assert.equal(retried.applied, true);
  assert.equal(retried.state.streamSequences[streamId], 3);
  assert.equal(retried.state.resyncRequests[streamId], undefined);
});

test("ACV2 high-water snapshot on the same stream recovers and allows the next cursor", () => {
  const one = durableRunStatus(1);
  const three = durableRunStatus(3);
  const eleven = durableRunStatus(11);
  const streamId = one.stream.id;

  const gapped = reduceChatEvent(reduceChatEvent(createInitialChatState(), one).state, three);
  assert.equal(gapped.applied, false);
  assert.equal(gapped.reason, "stream_gap");

  const snapshot = {
    protocolVersion: 1,
    id: "snapshot-hw",
    type: "thread.snapshot",
    source: "test",
    occurredAt: ISO,
    threadId: "thread-1",
    stream: { id: streamId, sequence: 10 },
    payload: {
      thread: {
        id: "thread-1",
        appKey: "test-app",
        organizationId: "org-1",
        status: "active",
      },
      turns: [],
      items: [],
      surfaces: [],
      interactions: [],
    },
  };

  const recovered = reduceChatEvent(gapped.state, snapshot);
  assert.equal(recovered.applied, true);
  assert.equal(recovered.state.streamSequences[streamId], 10);
  assert.equal(recovered.state.resyncRequests[streamId], undefined);

  const advanced = reduceChatEvent(recovered.state, eleven);
  assert.equal(advanced.applied, true);
  assert.equal(advanced.state.streamSequences[streamId], 11);
});
