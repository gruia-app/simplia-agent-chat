import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { createInitialChatState, reduceChatEvent } from "@simplia/agent-chat-core/state";
import { hasGrantedCapability } from "@simplia/agent-chat-core/providers";
import {
  ACV2_PROVIDER_CAPABILITIES,
  acv2PmAdapter,
} from "@simplia/agent-chat-adapter-acv2";
import { ChatComposer, ReactSurfaceRegistry } from "@simplia/agent-chat-react";

const [event] = acv2PmAdapter.normalize({
  event_kind: "message_completed",
  run_id: "run-1",
  payload: { response: "External package smoke passed" },
}, {
  source: "consumer-smoke",
  threadId: "thread-1",
  turnId: "run-1",
  appKey: "consumer",
  organizationId: "org-1",
});

assert.ok(event);
const state = reduceChatEvent(createInitialChatState(), event).state;
assert.equal(state.items["assistant:run-1"].text, "External package smoke passed");

const codex = {
  providerId: "codex_cli",
  mode: "agent",
  features: ACV2_PROVIDER_CAPABILITIES.codex_cli.features,
  grantedPermissions: { filesystemWrite: true },
};
assert.equal(hasGrantedCapability(codex, "filesystemWrite"), true);

const registry = new ReactSurfaceRegistry();
assert.deepEqual(registry.kinds(), []);
const html = renderToStaticMarkup(createElement(ChatComposer, {
  ariaLabel: "External consumer composer",
  onSubmit: () => undefined,
}));
assert.match(html, /External consumer composer/);
assert.match(import.meta.resolve("@simplia/agent-chat-react/styles.css"), /styles\.css$/);

console.log("external_consumer_smoke_ok");
