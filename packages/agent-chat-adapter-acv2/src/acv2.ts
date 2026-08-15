import {
  recordValue,
  stringValue,
  type AdapterContext,
  type ChatEvent,
  type ChatTransportAdapter,
  type ItemStatus,
  type TurnStatus,
} from "simplia-agent-chat/core/protocol";
import {
  event,
  providerFrom,
  stableSuffix,
  threadScopedEntityId,
  threadScopedTurnId,
} from "simplia-agent-chat/core/adapters/shared";

export interface Acv2DurableEvent {
  cursor?: number;
  event_kind?: string;
  run_id?: string;
  thread_id?: string;
  created_at?: string;
  payload?: unknown;
}

function turnStatus(value: unknown): TurnStatus {
  switch (String(value ?? "").toUpperCase()) {
    case "QUEUED": return "queued";
    case "RUNNING": return "running";
    case "WAITING_INPUT": return "waiting_input";
    case "COMPLETED": return "completed";
    case "FAILED": return "failed";
    case "INTERRUPTED": return "interrupted";
    case "CANCELLED": return "cancelled";
    case "CANCEL_REQUESTED": return "running";
    default: return "running";
  }
}

function itemStatus(value: unknown, fallback: ItemStatus): ItemStatus {
  const status = turnStatus(value);
  if (status === "completed") return "completed";
  if (status === "failed") return "failed";
  if (status === "interrupted" || status === "cancelled") return "failed";
  return fallback;
}

function durableCursor(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

function textFragment(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export const acv2PmAdapter: ChatTransportAdapter<Acv2DurableEvent> = {
  id: "acv2-pm-v1",
  normalize(input, baseContext) {
    const payload = recordValue(input.payload);
    const eventKind = stringValue(input.event_kind) ?? "system";
    const nativeEvent = stringValue(payload.event) ?? eventKind;
    const nativeThreadId = stringValue(input.thread_id);
    const nativeRunId = stringValue(input.run_id) ?? stringValue(baseContext.turnId);
    const nativeToolId = stringValue(payload.tool_use_id) ?? stringValue(payload.id);
    const turnId = threadScopedTurnId(baseContext.threadId, nativeRunId);
    const cursor = durableCursor(input.cursor);
    const { streamId: callerStreamId, sequence: _callerSequence, ...baseWithoutStream } = baseContext;
    const context: AdapterContext = {
      ...baseWithoutStream,
      turnId,
      ...(input.created_at ? { occurredAt: input.created_at } : {}),
      ...(cursor !== undefined
        ? {
            // ACV2 cursors are journal-wide for one durable thread. A stream
            // scoped to each run would observe artificial gaps whenever runs
            // interleave on that journal.
            streamId: stringValue(callerStreamId) ?? `${baseContext.threadId}:durable`,
            sequence: cursor,
          }
        : {}),
    };
    const provider = {
      ...providerFrom(payload, "acv2"),
      ...(nativeThreadId ? { nativeThreadId } : {}),
      ...(nativeRunId ? { nativeTurnId: nativeRunId } : {}),
    };
    const suffix = stableSuffix(cursor ?? baseContext.sequence, eventKind, nativeToolId);
    const threadPrefix = `${baseContext.threadId}:`;
    const runKey = nativeRunId
      ? (nativeRunId.startsWith(threadPrefix) ? nativeRunId.slice(threadPrefix.length) : nativeRunId)
      : "run";
    const events: ChatEvent[] = [];

    if (eventKind === "message_delta") {
      const delta = textFragment(payload.chunk) ?? textFragment(payload.content) ?? textFragment(payload.text) ?? "";
      if (delta) {
        events.push(event("item.delta", context, suffix, {
          itemId: threadScopedEntityId(baseContext.threadId, undefined, `assistant:${runKey}`),
          delta,
        }, provider));
      } else if (cursor !== undefined) {
        events.push(event("warning", context, suffix, {
          code: "acv2_empty_message_delta",
          message: "Durable message delta contained no text.",
        }, provider));
      }
      return events;
    }

    if (eventKind === "message_completed") {
      events.push(event("item.upsert", context, suffix, {
        id: threadScopedEntityId(baseContext.threadId, undefined, `assistant:${runKey}`),
        threadId: context.threadId,
        turnId,
        kind: "message",
        role: "assistant",
        status: "completed",
        text: textFragment(payload.response) ?? textFragment(payload.content) ?? "",
        ...(input.created_at ? { completedAt: input.created_at } : {}),
        metadata: { nativeEvent },
      }, provider));
      return events;
    }

    if (eventKind === "tool_use" || eventKind === "tool_result") {
      const toolUseId = nativeToolId ?? stableSuffix(cursor, nativeEvent);
      const isResult = eventKind === "tool_result";
      const isError = Boolean(payload.is_error || payload.error);
      events.push(event("item.upsert", context, suffix, {
        id: threadScopedEntityId(
          baseContext.threadId,
          nativeToolId,
          `tool:${runKey}:${toolUseId}`,
        ),
        threadId: context.threadId,
        turnId,
        kind: "tool",
        role: "tool",
        status: isResult ? (isError ? "failed" : "completed") : "streaming",
        toolName: stringValue(payload.tool_name) ?? stringValue(payload.tool) ?? "tool",
        isError,
        metadata: {
          nativeEvent,
          ...(nativeToolId ? { nativeItemId: nativeToolId } : {}),
        },
      }, provider));
      return events;
    }

    if (eventKind === "run_status") {
      const reason = stringValue(payload.reason);
      const status = reason === "stale_heartbeat"
        ? "failed"
        : reason === "superseded_by_new_turn"
          ? "interrupted"
          : turnStatus(payload.status ?? nativeEvent);
      const error = stringValue(payload.error) ?? stringValue(payload.user_message);
      events.push(event("turn.status", context, suffix, {
        status,
        ...((status === "completed" || status === "failed" || status === "interrupted" || status === "cancelled") && context.occurredAt
          ? { completedAt: context.occurredAt }
          : {}),
        ...(error ? { error } : {}),
      }, provider));
      return events;
    }

    events.push(event("item.upsert", context, suffix, {
      id: threadScopedEntityId(
        baseContext.threadId,
        undefined,
        `system:${runKey}:${stableSuffix(cursor, nativeEvent)}`,
      ),
      threadId: context.threadId,
      turnId,
      kind: "system",
      role: "system",
      status: itemStatus(payload.status, "completed"),
      text: stringValue(payload.message) ?? stringValue(payload.error) ?? nativeEvent,
      metadata: { nativeEvent },
    }, provider));
    return events;
  },
};

export const ACV2_DURABLE_EVENT_KINDS = [
  "message_delta",
  "message_completed",
  "tool_use",
  "tool_result",
  "run_status",
  "system",
] as const;
