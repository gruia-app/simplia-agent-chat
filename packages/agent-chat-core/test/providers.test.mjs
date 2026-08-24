import assert from "node:assert/strict";
import test from "node:test";

import {
  BASE_AGENT_FEATURES,
  CHAT_COMPLETION_FEATURES,
  createProviderCatalog,
  createAgentProviderFeatures,
  hasGrantedCapability,
  sanitizeProviderConnection,
  supportsFeature,
} from "../dist/index.js";

test("agent feature profiles preserve unknown support unless explicitly overridden", () => {
  const features = createAgentProviderFeatures({
    approvals: "supported",
    filesystemWrite: "supported",
  });
  assert.equal(features.approvals, "supported");
  assert.equal(features.filesystemWrite, "supported");
  assert.equal(features.terminal, "unknown");
  assert.equal(BASE_AGENT_FEATURES.filesystemWrite, "unknown");
});

test("feature negotiation reports tri-state support without coercion", () => {
  const snapshot = {
    providerId: "example-agent",
    mode: "agent",
    features: createAgentProviderFeatures({ approvals: "supported" }),
  };
  assert.equal(supportsFeature(snapshot, "approvals"), "supported");
  assert.equal(supportsFeature(snapshot, "filesystemWrite"), "unknown");
});

test("dangerous capabilities require advertised support and an explicit grant", () => {
  const snapshot = {
    providerId: "example-agent",
    mode: "agent",
    features: createAgentProviderFeatures({ filesystemWrite: "supported" }),
  };
  assert.equal(hasGrantedCapability(snapshot, "filesystemWrite"), false);
  assert.equal(hasGrantedCapability({
    ...snapshot,
    grantedPermissions: { filesystemWrite: true },
  }, "filesystemWrite"), true);
  assert.equal(hasGrantedCapability({
    ...snapshot,
    features: createAgentProviderFeatures({ filesystemWrite: "unknown" }),
    grantedPermissions: { filesystemWrite: true },
  }, "filesystemWrite"), false);
});

test("chat-completion providers expose only transport-safe capabilities", () => {
  assert.equal(CHAT_COMPLETION_FEATURES.streaming, "supported");
  assert.equal(CHAT_COMPLETION_FEATURES.tools, "supported");
  assert.equal(CHAT_COMPLETION_FEATURES.attachments, "supported");
  for (const feature of [
    "filesystemRead", "filesystemWrite", "terminal", "approvals", "userInput", "steer", "resume",
    "rollback", "plan", "subagents",
  ]) {
    assert.equal(CHAT_COMPLETION_FEATURES[feature], "unsupported", feature);
  }
  assert.equal(CHAT_COMPLETION_FEATURES.reasoning, "unknown");
});

test("provider catalog is extensible and returns immutable provider definitions", () => {
  const catalog = createProviderCatalog([
    {
      id: "codex_cli",
      displayName: "Codex",
      modes: ["agent"],
      authMethods: ["chatgpt_device", "api_key"],
      defaultModel: "gpt-5.6-sol",
    },
    {
      id: "openrouter",
      displayName: "OpenRouter",
      modes: ["chat_completion"],
      authMethods: ["api_key"],
      supportsCustomModels: true,
    },
  ]);

  assert.deepEqual(catalog.list().map((provider) => provider.id), ["codex_cli", "openrouter"]);
  assert.equal(catalog.get("codex_cli")?.defaultModel, "gpt-5.6-sol");
  assert.throws(() => catalog.register({
    id: "codex_cli",
    displayName: "Duplicate",
    modes: ["agent"],
    authMethods: ["api_key"],
  }), /provider_already_registered/);
});

test("provider connection summaries fail closed and never expose credential material", () => {
  const safe = sanitizeProviderConnection({
    id: "account-1",
    providerId: "codex_cli",
    label: "Work account",
    scope: "personal",
    status: "connected",
    authMethod: "chatgpt_device",
    identity: { email: "operator@example.com", plan: "plus" },
    accessToken: "must-not-leak",
    apiKey: "must-not-leak",
    credentials: { refresh_token: "must-not-leak" },
  });

  assert.deepEqual(safe, {
    id: "account-1",
    providerId: "codex_cli",
    label: "Work account",
    scope: "personal",
    status: "connected",
    authMethod: "chatgpt_device",
    identity: { email: "operator@example.com", plan: "plus" },
  });
  assert.doesNotMatch(JSON.stringify(safe), /must-not-leak|token|apiKey/i);
});
