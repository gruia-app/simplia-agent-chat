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

export const CHAT_EVENT_TYPES = [
  "thread.snapshot",
  "thread.upsert",
  "turn.upsert",
  "turn.status",
  "item.upsert",
  "item.delta",
  "interaction.requested",
  "interaction.resolved",
  "surface.upsert",
  "surface.patch",
  "usage.updated",
  "warning",
] as const;

export type ChatEventType = (typeof CHAT_EVENT_TYPES)[number];

export type ChatEventValidationReason = "invalid_event" | "unsupported_protocol" | "unknown_event_type";

export type ChatEventValidationResult =
  | { ok: true; event: ChatEvent }
  | { ok: false; reason: ChatEventValidationReason };

const CHAT_EVENT_TYPE_SET = new Set<string>(CHAT_EVENT_TYPES);
const THREAD_STATUSES = new Set(["idle", "active", "waiting_approval", "waiting_input", "error"]);
const TURN_STATUSES = new Set([
  "queued",
  "running",
  "waiting_approval",
  "waiting_input",
  "completed",
  "failed",
  "interrupted",
  "cancelled",
]);
const ITEM_STATUSES = new Set(["pending", "streaming", "completed", "failed", "declined"]);
const ITEM_KINDS = new Set([
  "message",
  "reasoning",
  "plan",
  "command",
  "file_change",
  "tool",
  "subagent",
  "system",
  "unknown",
]);
const SURFACE_STATUSES = new Set(["draft", "streaming", "ready", "action_required", "completed", "failed"]);
const SURFACE_PATCH_OPERATIONS = new Set(["replace", "merge", "append_page", "complete", "fail"]);
const INTERACTION_KINDS = new Set(["approval", "question", "elicitation"]);
const INTERACTION_STATUSES = new Set(["pending", "resolved", "cancelled"]);
const DELTA_FIELDS = new Set(["text", "output"]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asNonNegativeInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

function fail(reason: ChatEventValidationReason): ChatEventValidationResult {
  return { ok: false, reason };
}

function hasMatchingThread(entityThreadId: string, envelopeThreadId: string): boolean {
  return entityThreadId === envelopeThreadId;
}

function hasMatchingTurn(entityTurnId: string | undefined, envelopeTurnId: string | undefined): boolean {
  return envelopeTurnId === undefined || entityTurnId === undefined || entityTurnId === envelopeTurnId;
}

function isChatThread(value: unknown): value is ChatThread {
  if (!isPlainObject(value)) return false;
  return Boolean(
    stringValue(value.id)
    && stringValue(value.appKey)
    && stringValue(value.organizationId)
    && typeof value.status === "string"
    && THREAD_STATUSES.has(value.status),
  );
}

function isChatTurn(value: unknown): value is ChatTurn {
  if (!isPlainObject(value)) return false;
  return Boolean(
    stringValue(value.id)
    && stringValue(value.threadId)
    && typeof value.status === "string"
    && TURN_STATUSES.has(value.status)
    && Array.isArray(value.itemIds)
    && value.itemIds.every((id) => typeof id === "string" && id.length > 0),
  );
}

function isChatItem(value: unknown): value is ChatItem {
  if (!isPlainObject(value)) return false;
  return Boolean(
    stringValue(value.id)
    && stringValue(value.threadId)
    && stringValue(value.turnId)
    && typeof value.kind === "string"
    && ITEM_KINDS.has(value.kind)
    && typeof value.status === "string"
    && ITEM_STATUSES.has(value.status),
  );
}

function isSurfaceBlock(value: unknown): value is SurfaceBlock {
  if (!isPlainObject(value)) return false;
  return Boolean(
    stringValue(value.id)
    && stringValue(value.threadId)
    && stringValue(value.kind)
    && asNonNegativeInteger(value.schemaVersion) !== undefined
    && asNonNegativeInteger(value.revision) !== undefined
    && typeof value.status === "string"
    && SURFACE_STATUSES.has(value.status)
    && "payload" in value
    && isJsonValue(value.payload)
    && (value.turnId === undefined || Boolean(stringValue(value.turnId))),
  );
}

function isPendingInteraction(value: unknown): value is PendingInteraction {
  if (!isPlainObject(value)) return false;
  return Boolean(
    stringValue(value.id)
    && stringValue(value.threadId)
    && stringValue(value.turnId)
    && typeof value.kind === "string"
    && INTERACTION_KINDS.has(value.kind)
    && typeof value.status === "string"
    && INTERACTION_STATUSES.has(value.status)
    && stringValue(value.title)
    && "payload" in value
    && isJsonValue(value.payload),
  );
}

function isThreadSnapshot(value: unknown): value is ThreadSnapshot {
  if (!isPlainObject(value)) return false;
  if (!isChatThread(value.thread)) return false;
  if (!Array.isArray(value.turns) || !value.turns.every(isChatTurn)) return false;
  if (!Array.isArray(value.items) || !value.items.every(isChatItem)) return false;
  if (!Array.isArray(value.surfaces) || !value.surfaces.every(isSurfaceBlock)) return false;
  if (!Array.isArray(value.interactions) || !value.interactions.every(isPendingInteraction)) return false;
  return true;
}

function payloadAgreesWithEnvelope(type: string, envelope: Record<string, unknown>, payload: unknown): boolean {
  const threadId = String(envelope.threadId);
  const turnId = typeof envelope.turnId === "string" ? envelope.turnId : undefined;
  switch (type) {
    case "thread.upsert":
      return isChatThread(payload) && payload.id === threadId;
    case "thread.snapshot":
      return isThreadSnapshot(payload)
        && payload.thread.id === threadId
        && payload.turns.every((turn) => hasMatchingThread(turn.threadId, threadId))
        && payload.items.every((item) => hasMatchingThread(item.threadId, threadId))
        && payload.surfaces.every((surface) => hasMatchingThread(surface.threadId, threadId))
        && payload.interactions.every((interaction) => hasMatchingThread(interaction.threadId, threadId));
    case "turn.upsert":
      return isChatTurn(payload)
        && hasMatchingThread(payload.threadId, threadId)
        && hasMatchingTurn(payload.id, turnId);
    case "turn.status":
      return isPlainObject(payload)
        && typeof payload.status === "string"
        && TURN_STATUSES.has(payload.status);
    case "item.upsert":
      return isChatItem(payload)
        && hasMatchingThread(payload.threadId, threadId)
        && hasMatchingTurn(payload.turnId, turnId);
    case "item.delta":
      return isPlainObject(payload)
        && Boolean(stringValue(payload.itemId))
        && typeof payload.delta === "string"
        && (payload.field === undefined || (typeof payload.field === "string" && DELTA_FIELDS.has(payload.field)));
    case "interaction.requested":
      return isPendingInteraction(payload)
        && hasMatchingThread(payload.threadId, threadId)
        && hasMatchingTurn(payload.turnId, turnId);
    case "interaction.resolved":
      return isPlainObject(payload) && Boolean(stringValue(payload.interactionId));
    case "surface.upsert":
      return isSurfaceBlock(payload)
        && hasMatchingThread(payload.threadId, threadId)
        && hasMatchingTurn(payload.turnId, turnId);
    case "surface.patch":
      return isPlainObject(payload)
        && Boolean(stringValue(payload.surfaceId))
        && asNonNegativeInteger(payload.baseRevision) !== undefined
        && asNonNegativeInteger(payload.revision) !== undefined
        && typeof payload.operation === "string"
        && SURFACE_PATCH_OPERATIONS.has(payload.operation)
        && "payload" in payload
        && isJsonValue(payload.payload);
    case "usage.updated":
      return isPlainObject(payload);
    case "warning":
      return isPlainObject(payload)
        && Boolean(stringValue(payload.code))
        && Boolean(stringValue(payload.message));
    default:
      return false;
  }
}

export function validateChatEvent(input: unknown): ChatEventValidationResult {
  if (!isPlainObject(input)) return fail("invalid_event");

  const protocolVersion = input.protocolVersion;
  if (protocolVersion === undefined || protocolVersion === null) return fail("unsupported_protocol");
  if (typeof protocolVersion !== "number" || !Number.isFinite(protocolVersion)) return fail("invalid_event");
  if (!Number.isInteger(protocolVersion) || protocolVersion !== CHAT_PROTOCOL_VERSION) {
    return fail("unsupported_protocol");
  }

  if (typeof input.type !== "string" || !input.type.trim()) return fail("invalid_event");
  if (!CHAT_EVENT_TYPE_SET.has(input.type)) return fail("unknown_event_type");

  if (!stringValue(input.id) || !stringValue(input.source) || !stringValue(input.occurredAt) || !stringValue(input.threadId)) {
    return fail("invalid_event");
  }
  if (input.turnId !== undefined && !stringValue(input.turnId)) return fail("invalid_event");
  if (input.payload === undefined) return fail("invalid_event");

  if (input.stream !== undefined) {
    if (!isPlainObject(input.stream)) return fail("invalid_event");
    if (!stringValue(input.stream.id) || asNonNegativeInteger(input.stream.sequence) === undefined) {
      return fail("invalid_event");
    }
  }

  if (input.provider !== undefined) {
    if (!isPlainObject(input.provider) || !stringValue(input.provider.provider)) return fail("invalid_event");
  }

  if (!payloadAgreesWithEnvelope(input.type, input, input.payload)) return fail("invalid_event");
  return { ok: true, event: input as unknown as ChatEvent };
}
