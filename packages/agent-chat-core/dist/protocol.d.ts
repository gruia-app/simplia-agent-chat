export declare const CHAT_PROTOCOL_VERSION: 1;
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | {
    [key: string]: JsonValue;
};
export type ChatRole = "user" | "assistant" | "system" | "tool";
export type TurnStatus = "queued" | "running" | "waiting_approval" | "waiting_input" | "completed" | "failed" | "interrupted" | "cancelled";
export type ItemStatus = "pending" | "streaming" | "completed" | "failed" | "declined";
export type SurfaceStatus = "draft" | "streaming" | "ready" | "action_required" | "completed" | "failed";
export interface ProviderMetadata {
    provider: string;
    model?: string;
    reasoningEffort?: string;
    sessionId?: string;
    nativeThreadId?: string;
    nativeTurnId?: string;
    raw?: Record<string, JsonValue>;
}
export interface ChatThread {
    id: string;
    appKey: string;
    organizationId: string;
    title?: string;
    status: "idle" | "active" | "waiting_approval" | "waiting_input" | "error";
    provider?: ProviderMetadata;
    metadata?: Record<string, JsonValue>;
}
export interface ChatTurn {
    id: string;
    threadId: string;
    status: TurnStatus;
    itemIds: string[];
    startedAt?: string;
    completedAt?: string;
    provider?: ProviderMetadata;
    error?: string;
}
export interface ChatItem {
    id: string;
    threadId: string;
    turnId: string;
    kind: "message" | "reasoning" | "plan" | "command" | "file_change" | "tool" | "subagent" | "system" | "unknown";
    status: ItemStatus;
    role?: ChatRole;
    text?: string;
    title?: string;
    toolName?: string;
    input?: JsonValue;
    output?: JsonValue;
    isError?: boolean;
    startedAt?: string;
    completedAt?: string;
    metadata?: Record<string, JsonValue>;
}
export interface SurfaceActionRef {
    id: string;
    action: string;
    label: string;
    intent: "neutral" | "primary" | "danger";
    inputSchemaId?: string;
    requiresConfirmation?: boolean;
}
export interface SurfaceBlock<TPayload extends JsonValue = JsonValue> {
    id: string;
    threadId: string;
    turnId?: string;
    itemId?: string;
    kind: string;
    schemaVersion: number;
    revision: number;
    status: SurfaceStatus;
    payload: TPayload;
    actions?: SurfaceActionRef[];
    presentation?: {
        title?: string;
        density?: "compact" | "comfortable" | "expanded";
        preferredSurface?: "inline" | "panel" | "fullscreen";
    };
}
export interface SurfacePatch {
    surfaceId: string;
    baseRevision: number;
    revision: number;
    operation: "replace" | "merge" | "append_page" | "complete" | "fail";
    payload: JsonValue;
}
export interface PendingInteraction {
    id: string;
    threadId: string;
    turnId: string;
    itemId?: string;
    kind: "approval" | "question" | "elicitation";
    status: "pending" | "resolved" | "cancelled";
    title: string;
    description?: string;
    payload: JsonValue;
    availableDecisions?: string[];
    createdAt?: string;
    resolvedAt?: string;
    resolution?: JsonValue;
}
export interface ChatUsage {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    costUsd?: number;
}
export interface ThreadSnapshot {
    thread: ChatThread;
    turns: ChatTurn[];
    items: ChatItem[];
    surfaces: SurfaceBlock[];
    interactions: PendingInteraction[];
    usage?: ChatUsage;
}
export interface ChatEventEnvelope<TType extends string, TPayload> {
    protocolVersion: typeof CHAT_PROTOCOL_VERSION;
    id: string;
    type: TType;
    source: string;
    occurredAt: string;
    threadId: string;
    turnId?: string;
    stream?: {
        id: string;
        sequence: number;
    };
    provider?: ProviderMetadata;
    payload: TPayload;
}
export type ChatEvent = ChatEventEnvelope<"thread.snapshot", ThreadSnapshot> | ChatEventEnvelope<"thread.upsert", ChatThread> | ChatEventEnvelope<"turn.upsert", ChatTurn> | ChatEventEnvelope<"turn.status", {
    status: TurnStatus;
    completedAt?: string;
    error?: string;
}> | ChatEventEnvelope<"item.upsert", ChatItem> | ChatEventEnvelope<"item.delta", {
    itemId: string;
    delta: string;
    field?: "text" | "output";
}> | ChatEventEnvelope<"interaction.requested", PendingInteraction> | ChatEventEnvelope<"interaction.resolved", {
    interactionId: string;
    resolution?: JsonValue;
    resolvedAt?: string;
}> | ChatEventEnvelope<"surface.upsert", SurfaceBlock> | ChatEventEnvelope<"surface.patch", SurfacePatch> | ChatEventEnvelope<"usage.updated", ChatUsage> | ChatEventEnvelope<"warning", {
    code: string;
    message: string;
    detail?: JsonValue;
}>;
export interface AdapterContext {
    source: string;
    threadId: string;
    turnId?: string;
    appKey?: string;
    organizationId?: string;
    occurredAt?: string;
    streamId?: string;
    sequence?: number;
}
export interface ChatTransportAdapter<TInput = unknown> {
    readonly id: string;
    normalize(input: TInput, context: AdapterContext): ChatEvent[];
}
export declare function isJsonValue(value: unknown): value is JsonValue;
export declare function jsonValue(value: unknown, fallback?: JsonValue): JsonValue;
export declare function recordValue(value: unknown): Record<string, unknown>;
export declare function stringValue(value: unknown): string | undefined;
export declare function numberValue(value: unknown): number | undefined;
export declare function eventBase<TType extends ChatEvent["type"]>(type: TType, context: AdapterContext, suffix: string): Omit<ChatEventEnvelope<TType, never>, "payload">;
export declare const CHAT_EVENT_TYPES: readonly ["thread.snapshot", "thread.upsert", "turn.upsert", "turn.status", "item.upsert", "item.delta", "interaction.requested", "interaction.resolved", "surface.upsert", "surface.patch", "usage.updated", "warning"];
export type ChatEventType = (typeof CHAT_EVENT_TYPES)[number];
export type ChatEventValidationReason = "invalid_event" | "unsupported_protocol" | "unknown_event_type";
export type ChatEventValidationResult = {
    ok: true;
    event: ChatEvent;
} | {
    ok: false;
    reason: ChatEventValidationReason;
};
export declare function validateChatEvent(input: unknown): ChatEventValidationResult;
//# sourceMappingURL=protocol.d.ts.map