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
import type { ChatEvent, JsonValue, PendingInteraction, ProviderMetadata } from "./protocol.js";
//# sourceMappingURL=providers.d.ts.map