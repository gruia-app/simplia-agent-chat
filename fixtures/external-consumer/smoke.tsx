import type { ChatState, SurfaceBlock } from "@simplia/agent-chat-core";
import { createInitialChatState } from "@simplia/agent-chat-core/state";
import { acv2ProviderCapabilities } from "@simplia/agent-chat-adapter-acv2";
import { AgentChatShell, ReactSurfaceRegistry } from "@simplia/agent-chat-react";

const state: ChatState = createInitialChatState();
const registry = new ReactSurfaceRegistry();
const provider = acv2ProviderCapabilities("codex_cli");
const surface: SurfaceBlock = {
  id: "surface-1",
  threadId: "thread-1",
  kind: "consumer.example",
  schemaVersion: 1,
  revision: 1,
  status: "ready",
  payload: { ok: true },
};

void provider;
void surface;

export const view = (
  <AgentChatShell
    state={state}
    threadId="thread-1"
    title="External consumer"
    surfaceRegistry={registry}
    composerAriaLabel="Message external consumer"
    onSubmit={() => undefined}
    onResolveInteraction={() => undefined}
  />
);
