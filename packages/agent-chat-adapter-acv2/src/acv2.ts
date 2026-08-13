import {
  jsonValue,
  recordValue,
  stringValue,
  type AdapterContext,
  type ChatEvent,
  type ChatTransportAdapter,
  type ItemStatus,
  type TurnStatus,
} from "@simplia/agent-chat-core/protocol";
import { event, providerFrom, stableSuffix } from "@simplia/agent-chat-core/adapters/shared";

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

export const acv2PmAdapter: ChatTransportAdapter<Acv2DurableEvent> = {
  id: "acv2-pm-v1",
  normalize(input, baseContext) {
    const payload = recordValue(input.payload);
    const eventKind = stringValue(input.event_kind) ?? "system";
    const nativeEvent = stringValue(payload.event) ?? eventKind;
    const turnId = stringValue(input.run_id) ?? baseContext.turnId ?? `run:${baseContext.threadId}`;
    const cursor = typeof input.cursor === "number" ? input.cursor : baseContext.sequence;
    const context: AdapterContext = {
      ...baseContext,
      turnId,
      ...(input.created_at ? { occurredAt: input.created_at } : {}),
      ...(cursor !== undefined ? { sequence: cursor } : {}),
    };
    const provider = providerFrom(payload, "acv2");
    const suffix = stableSuffix(cursor, eventKind, stringValue(payload.tool_use_id));
    const events: ChatEvent[] = [];

    if (eventKind === "message_delta") {
      const delta = stringValue(payload.chunk) ?? stringValue(payload.content) ?? stringValue(payload.text) ?? "";
      if (delta) {
        events.push(event("item.delta", context, suffix, { itemId: `assistant:${turnId}`, delta }, provider));
      }
      return events;
    }

    if (eventKind === "message_completed") {
      events.push(event("item.upsert", context, suffix, {
        id: `assistant:${turnId}`,
        threadId: context.threadId,
        turnId,
        kind: "message",
        role: "assistant",
        status: "completed",
        text: stringValue(payload.response) ?? stringValue(payload.content) ?? "",
        ...(input.created_at ? { completedAt: input.created_at } : {}),
        metadata: { nativeEvent },
      }, provider));
      return events;
    }

    if (eventKind === "tool_use" || eventKind === "tool_result") {
      const toolUseId = stringValue(payload.tool_use_id) ?? stringValue(payload.id) ?? stableSuffix(cursor, nativeEvent);
      const isResult = eventKind === "tool_result";
      const isError = Boolean(payload.is_error || payload.error);
      events.push(event("item.upsert", context, suffix, {
        id: `tool:${turnId}:${toolUseId}`,
        threadId: context.threadId,
        turnId,
        kind: "tool",
        role: "tool",
        status: isResult ? (isError ? "failed" : "completed") : "streaming",
        toolName: stringValue(payload.tool_name) ?? stringValue(payload.tool) ?? "tool",
        ...(isResult ? { output: jsonValue(payload.result ?? payload.output ?? payload.error) } : { input: jsonValue(payload.input) }),
        isError,
        metadata: { nativeEvent },
      }, provider));
      return events;
    }

    if (eventKind === "run_status") {
      const status = turnStatus(payload.status ?? nativeEvent);
      const error = stringValue(payload.error) ?? stringValue(payload.user_message);
      events.push(event("turn.status", context, suffix, {
        status,
        ...(status === "completed" || status === "failed" || status === "interrupted" || status === "cancelled"
          ? { completedAt: context.occurredAt ?? new Date().toISOString() }
          : {}),
        ...(error ? { error } : {}),
      }, provider));
      return events;
    }

    events.push(event("item.upsert", context, suffix, {
      id: `system:${turnId}:${stableSuffix(cursor, nativeEvent)}`,
      threadId: context.threadId,
      turnId,
      kind: "system",
      role: "system",
      status: itemStatus(payload.status, "completed"),
      text: stringValue(payload.message) ?? stringValue(payload.error) ?? nativeEvent,
      metadata: { nativeEvent, payload: jsonValue(payload) },
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
