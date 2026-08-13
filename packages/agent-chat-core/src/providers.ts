export interface ProviderCapabilities {
  integrationMode: "cli" | "sdk" | "api";
  resume: "warm" | "cold" | "none";
  subagents: boolean;
  modelFamily: "gpt" | "claude" | null;
  auth: "cli_login" | "api_key";
  features: AgentProviderFeatures;
}

export interface AgentProviderFeatures {
  streaming: CapabilitySupport;
  tools: CapabilitySupport;
  filesystemRead: CapabilitySupport;
  filesystemWrite: CapabilitySupport;
  terminal: CapabilitySupport;
  approvals: CapabilitySupport;
  userInput: CapabilitySupport;
  steer: CapabilitySupport;
  resume: CapabilitySupport;
  rollback: CapabilitySupport;
  attachments: CapabilitySupport;
  reasoning: CapabilitySupport;
  plan: CapabilitySupport;
  subagents: CapabilitySupport;
}

export type CapabilitySupport = "supported" | "unsupported" | "unknown";
export type AgentFeature = keyof AgentProviderFeatures;

export interface ProviderCapabilitySnapshot {
  providerId: string;
  mode: "agent" | "chat_completion";
  features: AgentProviderFeatures;
  grantedPermissions?: Partial<Record<"filesystemRead" | "filesystemWrite" | "terminal", boolean>>;
}

export interface StartTurnRequest {
  threadId: string;
  turnId: string;
  prompt: string;
  attachments?: JsonValue[];
  provider?: ProviderMetadata;
  metadata?: Record<string, JsonValue>;
}

export interface ResolveInteractionRequest {
  interaction: PendingInteraction;
  decision: string;
  input?: JsonValue;
  idempotencyKey: string;
}

export interface AgentProviderPort {
  readonly kind: "agent";
  readonly id: string;
  getCapabilities(): Promise<ProviderCapabilitySnapshot>;
  startTurn(request: StartTurnRequest): AsyncIterable<ChatEvent>;
  resolveInteraction(request: ResolveInteractionRequest): Promise<void>;
  interrupt(threadId: string, turnId: string): Promise<void>;
  steer?(threadId: string, turnId: string, prompt: string): Promise<void>;
}

export interface ChatCompletionPort {
  readonly kind: "chat_completion";
  readonly id: string;
  getCapabilities(): Promise<ProviderCapabilitySnapshot>;
  complete(request: StartTurnRequest): AsyncIterable<ChatEvent>;
}

export type ChatProviderPort = AgentProviderPort | ChatCompletionPort;

export const BASE_AGENT_FEATURES: AgentProviderFeatures = {
  streaming: "supported",
  tools: "supported",
  filesystemRead: "unknown",
  filesystemWrite: "unknown",
  terminal: "unknown",
  approvals: "unknown",
  userInput: "unknown",
  steer: "unknown",
  resume: "unknown",
  rollback: "unknown",
  attachments: "unknown",
  reasoning: "unknown",
  plan: "unknown",
  subagents: "unknown",
};

export const CHAT_COMPLETION_FEATURES: AgentProviderFeatures = {
  streaming: "supported",
  tools: "supported",
  filesystemRead: "unsupported",
  filesystemWrite: "unsupported",
  terminal: "unsupported",
  approvals: "unsupported",
  userInput: "unsupported",
  steer: "unsupported",
  resume: "unsupported",
  rollback: "unsupported",
  attachments: "supported",
  reasoning: "unknown",
  plan: "unsupported",
  subagents: "unsupported",
};

export function createAgentProviderFeatures(
  overrides: Partial<AgentProviderFeatures> = {},
): AgentProviderFeatures {
  return { ...BASE_AGENT_FEATURES, ...overrides };
}

export function supportsFeature(
  snapshot: ProviderCapabilitySnapshot,
  feature: AgentFeature,
): CapabilitySupport {
  return snapshot.features[feature];
}

export function hasGrantedCapability(
  snapshot: ProviderCapabilitySnapshot,
  feature: "filesystemRead" | "filesystemWrite" | "terminal",
): boolean {
  return snapshot.features[feature] === "supported" && snapshot.grantedPermissions?.[feature] === true;
}
import type { ChatEvent, JsonValue, PendingInteraction, ProviderMetadata } from "./protocol.js";
