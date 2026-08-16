import type {
  ChatState,
  SurfaceActionCommand,
  SurfaceActionReceipt,
  SurfaceActionState,
  SurfaceActionTransport,
  SurfaceBlock,
} from "simplia-agent-chat/core";
import { createInitialChatState } from "simplia-agent-chat/core/state";
import { acv2ProviderCapabilities } from "simplia-agent-chat/adapters/acv2";
import {
  AgentChatShell,
  ReactSurfaceRegistry,
  SurfaceHost,
  useSurfaceAction,
  type SurfaceActionController,
  type UseSurfaceActionOptions,
} from "simplia-agent-chat/react";

const state: ChatState = createInitialChatState();
const registry = new ReactSurfaceRegistry();
const provider = acv2ProviderCapabilities("codex_cli");
const command: SurfaceActionCommand = {
  idempotencyKey: "typed-consumer-action",
  threadId: "thread-1",
  surfaceId: "surface-1",
  revision: 1,
  actionId: "apply-proposal",
  action: "consumer.proposal.apply",
};
const receipt: SurfaceActionReceipt = {
  idempotencyKey: command.idempotencyKey,
  status: "unknown",
};
const hydrated: Pick<SurfaceActionState, "command" | "receipt"> = { command, receipt };
const transport: SurfaceActionTransport = {
  async execute(action) {
    return { idempotencyKey: action.idempotencyKey, status: "pending" };
  },
  async getReceipt(idempotencyKey) {
    return { idempotencyKey, status: "succeeded" };
  },
  async abandonUnknown(idempotencyKey, options) {
    const acknowledged: true = options.acknowledgePossibleEffects;
    void acknowledged;
    return { idempotencyKey, status: "failed" };
  },
};
const hookOptions: UseSurfaceActionOptions = { transport, initialState: hydrated };
const acceptController = (_controller: SurfaceActionController) => undefined;
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
void hookOptions;
void acceptController;
void useSurfaceAction;

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

export const host = (
  <SurfaceHost block={surface} registry={registry} />
);
