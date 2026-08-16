import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { createInitialChatState, reduceChatEvent } from "simplia-agent-chat/core/state";
import {
  beginSurfaceAction,
  createSurfaceActionState,
} from "simplia-agent-chat/core";
import { hasGrantedCapability } from "simplia-agent-chat/core/providers";
import {
  ACV2_PROVIDER_CAPABILITIES,
  acv2PmAdapter,
} from "simplia-agent-chat/adapters/acv2";
import {
  AgentChatShell,
  ChatComposer,
  ReactSurfaceRegistry,
  SurfaceHost,
  useSurfaceAction,
} from "simplia-agent-chat/react";

assert.equal(typeof beginSurfaceAction, "function");
assert.equal(typeof createSurfaceActionState, "function");
assert.equal(typeof useSurfaceAction, "function");

const surfaceAction = beginSurfaceAction(createSurfaceActionState(), {
  idempotencyKey: "consumer-action-key",
  threadId: "thread-1",
  surfaceId: "surface-1",
  revision: 1,
  actionId: "apply-proposal",
  action: "consumer.proposal.apply",
});
assert.equal(surfaceAction.accepted, true);
assert.equal(surfaceAction.state.receipt.status, "pending");

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
assert.equal(event.type, "item.upsert");
const state = reduceChatEvent(createInitialChatState(), event).state;
assert.match(event.payload.id, /^thread-1:/);
assert.equal(state.items[event.payload.id].text, "External package smoke passed");

const codex = {
  providerId: "codex_cli",
  mode: "agent",
  features: ACV2_PROVIDER_CAPABILITIES.codex_cli.features,
  grantedPermissions: { filesystemWrite: true },
};
assert.equal(hasGrantedCapability(codex, "filesystemWrite"), true);

const registry = new ReactSurfaceRegistry();
assert.deepEqual(registry.kinds(), []);
const composerHtml = renderToStaticMarkup(createElement(ChatComposer, {
  ariaLabel: "External consumer composer",
  onSubmit: () => undefined,
}));
assert.match(composerHtml, /External consumer composer/);

const shellHtml = renderToStaticMarkup(createElement(AgentChatShell, {
  state,
  threadId: "thread-1",
  title: "External consumer",
  surfaceRegistry: registry,
  composerAriaLabel: "Message external consumer",
  onSubmit: () => undefined,
  onResolveInteraction: () => undefined,
}));
assert.match(shellHtml, /SHARED_AGENT_CHAT/);
assert.match(shellHtml, /External consumer/);
assert.match(shellHtml, /Message external consumer/);

const surfaceHtml = renderToStaticMarkup(createElement(SurfaceHost, {
  block: {
    id: "surface-1",
    threadId: "thread-1",
    kind: "consumer.example",
    schemaVersion: 1,
    revision: 1,
    status: "ready",
    payload: { ok: true },
  },
  registry,
}));
assert.match(surfaceHtml, /SURFACE_UNAVAILABLE/);
assert.match(surfaceHtml, /consumer\.example/);
assert.doesNotMatch(surfaceHtml, /"ok":true/);

assert.match(import.meta.resolve("simplia-agent-chat/react/styles.css"), /styles\.css$/);

console.log("external_consumer_smoke_ok");
