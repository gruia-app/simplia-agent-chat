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

const ISO = "2026-08-13T12:00:00.000Z";
const CONTEXT = {
  source: "test",
  threadId: "thread-1",
  turnId: "turn-1",
  appKey: "test-app",
  organizationId: "org-1",
  occurredAt: ISO,
};

function only(input) {
  const events = acv2PmAdapter.normalize(input, CONTEXT);
  assert.equal(events.length, 1);
  return events[0];
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
