import type { ChatEvent, JsonValue, PendingInteraction, ProviderMetadata } from "./protocol.js";

export type ProviderAuthMethod =
  | "chatgpt_device"
  | "oauth_device"
  | "setup_token"
  | "api_key"
  | "cli_login"
  | "none";

export type ProviderConnectionScope = "personal" | "organization";
export type ProviderConnectionStatus =
  | "pending"
  | "connected"
  | "reconnect_required"
  | "unavailable"
  | "disabled";

export interface ProviderDefinition {
  id: string;
  displayName: string;
  modes: Array<"agent" | "chat_completion">;
  authMethods: ProviderAuthMethod[];
  defaultModel?: string;
  supportsCustomModels?: boolean;
  metadata?: Record<string, JsonValue>;
}

export interface ProviderModelDefinition {
  id: string;
  displayName: string;
  providerId: string;
  reasoningEfforts?: string[];
  verbosityLevels?: string[];
  isDefault?: boolean;
  inputModalities?: Array<"text" | "image" | "audio">;
}

export interface ProviderConnectionIdentity {
  email?: string;
  displayName?: string;
  accountId?: string;
  organization?: string;
  plan?: string;
}

export interface ProviderConnectionSummary {
  id: string;
  providerId: string;
  label: string;
  scope: ProviderConnectionScope;
  status: ProviderConnectionStatus;
  authMethod: ProviderAuthMethod;
  identity?: ProviderConnectionIdentity;
  defaultModel?: string;
  isDefault?: boolean;
  statusReason?: string;
  lastCheckedAt?: string;
}

export interface StartProviderConnectionRequest {
  providerId: string;
  authMethod: ProviderAuthMethod;
  label: string;
  scope: ProviderConnectionScope;
  /** Sensitive, write-only material. Implementations must never echo or persist this request. */
  secret?: string;
  configuration?: Record<string, JsonValue>;
}

export interface ProviderConnectionChallenge {
  connectionId: string;
  status: "pending" | "connected";
  verificationUrl?: string;
  userCode?: string;
  expiresAt?: string;
}

export interface ProviderConnectionHealth {
  connectionId: string;
  status: ProviderConnectionStatus;
  checkedAt: string;
  detail?: string;
}

export interface ProviderConnectionPort {
  listProviders(): Promise<ProviderDefinition[]>;
  listConnections(): Promise<ProviderConnectionSummary[]>;
  listModels(connectionId: string): Promise<ProviderModelDefinition[]>;
  startConnection(request: StartProviderConnectionRequest): Promise<ProviderConnectionChallenge>;
  readConnection(connectionId: string): Promise<ProviderConnectionSummary>;
  checkHealth(connectionId: string): Promise<ProviderConnectionHealth>;
  disconnect(connectionId: string): Promise<void>;
}

export interface ProviderCatalog {
  list(): ProviderDefinition[];
  get(providerId: string): ProviderDefinition | undefined;
  register(provider: ProviderDefinition): void;
}

function cloneProviderDefinition(provider: ProviderDefinition): ProviderDefinition {
  const cloned: ProviderDefinition = {
    ...provider,
    modes: [...provider.modes],
    authMethods: [...provider.authMethods],
  };
  if (provider.metadata) cloned.metadata = structuredClone(provider.metadata);
  return cloned;
}

function validateProviderDefinition(provider: ProviderDefinition): void {
  if (!provider.id.trim() || !provider.displayName.trim()) {
    throw new Error("invalid_provider_definition");
  }
  if (provider.modes.length === 0 || provider.authMethods.length === 0) {
    throw new Error("invalid_provider_definition");
  }
}

export function createProviderCatalog(initial: ProviderDefinition[] = []): ProviderCatalog {
  const providers = new Map<string, ProviderDefinition>();

  const register = (provider: ProviderDefinition): void => {
    validateProviderDefinition(provider);
    const id = provider.id.trim();
    if (providers.has(id)) throw new Error(`provider_already_registered:${id}`);
    providers.set(id, cloneProviderDefinition({ ...provider, id }));
  };

  for (const provider of initial) register(provider);

  return {
    list: () => [...providers.values()].map(cloneProviderDefinition),
    get: (providerId) => {
      const provider = providers.get(providerId);
      return provider ? cloneProviderDefinition(provider) : undefined;
    },
    register,
  };
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function sanitizeProviderConnection(input: Record<string, unknown>): ProviderConnectionSummary {
  const identityInput = input.identity && typeof input.identity === "object" && !Array.isArray(input.identity)
    ? input.identity as Record<string, unknown>
    : undefined;
  const identity = identityInput ? {
    email: optionalString(identityInput.email),
    displayName: optionalString(identityInput.displayName),
    accountId: optionalString(identityInput.accountId),
    organization: optionalString(identityInput.organization),
    plan: optionalString(identityInput.plan),
  } : undefined;
  const safeIdentity = identity && Object.values(identity).some(Boolean)
    ? (Object.fromEntries(
      Object.entries(identity).filter(([, value]) => value !== undefined),
    ) as ProviderConnectionIdentity)
    : undefined;

  const summary: ProviderConnectionSummary = {
    id: optionalString(input.id) ?? "",
    providerId: optionalString(input.providerId) ?? "",
    label: optionalString(input.label) ?? "",
    scope: input.scope === "organization" ? "organization" : "personal",
    status: ["pending", "connected", "reconnect_required", "unavailable", "disabled"].includes(
      String(input.status),
    ) ? input.status as ProviderConnectionStatus : "unavailable",
    authMethod: ["chatgpt_device", "oauth_device", "setup_token", "api_key", "cli_login", "none"].includes(
      String(input.authMethod),
    ) ? input.authMethod as ProviderAuthMethod : "none",
  };
  if (safeIdentity) summary.identity = safeIdentity;
  const defaultModel = optionalString(input.defaultModel);
  const statusReason = optionalString(input.statusReason);
  const lastCheckedAt = optionalString(input.lastCheckedAt);
  if (defaultModel) summary.defaultModel = defaultModel;
  if (typeof input.isDefault === "boolean") summary.isDefault = input.isDefault;
  if (statusReason) summary.statusReason = statusReason;
  if (lastCheckedAt) summary.lastCheckedAt = lastCheckedAt;
  return summary;
}

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
