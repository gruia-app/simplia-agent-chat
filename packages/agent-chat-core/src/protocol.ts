export const CHAT_PROTOCOL_VERSION = 1 as const;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type ChatRole = "user" | "assistant" | "system" | "tool";
export type TurnStatus =
  | "queued"
  | "running"
  | "waiting_approval"
  | "waiting_input"
  | "completed"
  | "failed"
  | "interrupted"
  | "cancelled";

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
  kind:
    | "message"
    | "reasoning"
    | "plan"
    | "command"
    | "file_change"
    | "tool"
    | "subagent"
    | "system"
    | "unknown";
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

export type ChatEvent =
  | ChatEventEnvelope<"thread.snapshot", ThreadSnapshot>
  | ChatEventEnvelope<"thread.upsert", ChatThread>
  | ChatEventEnvelope<"turn.upsert", ChatTurn>
  | ChatEventEnvelope<"turn.status", { status: TurnStatus; completedAt?: string; error?: string }>
  | ChatEventEnvelope<"item.upsert", ChatItem>
  | ChatEventEnvelope<"item.delta", { itemId: string; delta: string; field?: "text" | "output" }>
  | ChatEventEnvelope<"interaction.requested", PendingInteraction>
  | ChatEventEnvelope<"interaction.resolved", { interactionId: string; resolution?: JsonValue; resolvedAt?: string }>
  | ChatEventEnvelope<"surface.upsert", SurfaceBlock>
  | ChatEventEnvelope<"surface.patch", SurfacePatch>
  | ChatEventEnvelope<"usage.updated", ChatUsage>
  | ChatEventEnvelope<"warning", { code: string; message: string; detail?: JsonValue }>;

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

export function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (typeof value !== "object") return false;
  return Object.entries(value).every(([key, nested]) => key.length > 0 && isJsonValue(nested));
}

export function jsonValue(value: unknown, fallback: JsonValue = null): JsonValue {
  return isJsonValue(value) ? value : fallback;
}

export function recordValue(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function eventBase<TType extends ChatEvent["type"]>(
  type: TType,
  context: AdapterContext,
  suffix: string,
): Omit<ChatEventEnvelope<TType, never>, "payload"> {
  const occurredAt = context.occurredAt ?? new Date().toISOString();
  const stream = context.streamId !== undefined && context.sequence !== undefined
    ? { id: context.streamId, sequence: context.sequence }
    : undefined;
  return {
    protocolVersion: CHAT_PROTOCOL_VERSION,
    id: `${context.source}:${context.threadId}:${context.turnId ?? "thread"}:${suffix}`,
    type,
    source: context.source,
    occurredAt,
    threadId: context.threadId,
    ...(context.turnId ? { turnId: context.turnId } : {}),
    ...(stream ? { stream } : {}),
  };
}
