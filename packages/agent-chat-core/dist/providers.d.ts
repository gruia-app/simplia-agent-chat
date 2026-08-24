import type { ChatEvent, JsonValue, PendingInteraction, ProviderMetadata } from "./protocol.js";
export type ProviderAuthMethod = "chatgpt_device" | "oauth_device" | "setup_token" | "api_key" | "cli_login" | "none";
export type ProviderConnectionScope = "personal" | "organization";
export type ProviderConnectionStatus = "pending" | "connected" | "reconnect_required" | "unavailable" | "disabled";
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
export declare function createProviderCatalog(initial?: ProviderDefinition[]): ProviderCatalog;
export declare function sanitizeProviderConnection(input: Record<string, unknown>): ProviderConnectionSummary;
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
export declare const BASE_AGENT_FEATURES: AgentProviderFeatures;
export declare const CHAT_COMPLETION_FEATURES: AgentProviderFeatures;
export declare function createAgentProviderFeatures(overrides?: Partial<AgentProviderFeatures>): AgentProviderFeatures;
export declare function supportsFeature(snapshot: ProviderCapabilitySnapshot, feature: AgentFeature): CapabilitySupport;
export declare function hasGrantedCapability(snapshot: ProviderCapabilitySnapshot, feature: "filesystemRead" | "filesystemWrite" | "terminal"): boolean;
//# sourceMappingURL=providers.d.ts.map