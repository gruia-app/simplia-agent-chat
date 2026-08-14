import {
  jsonValue,
  recordValue,
  stringValue,
  type AdapterContext,
  type ChatEvent,
  type ChatTransportAdapter,
} from "../protocol.js";
import { event, stableSuffix, threadScopedEntityId, threadScopedTurnId } from "./shared.js";

export interface LangChainStreamInput {
  mode?: "updates" | "messages" | "custom" | "events";
  data?: unknown;
  event?: string;
  name?: string;
  run_id?: string;
  metadata?: unknown;
}

function messageParts(value: unknown): string {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";
  return value.map((part) => {
    const record = recordValue(part);
    return typeof record.text === "string"
      ? record.text
      : typeof record.content === "string"
        ? record.content
        : "";
  }).filter(Boolean).join("");
}

export const langChainAdapter: ChatTransportAdapter<LangChainStreamInput> = {
  id: "langchain-stream-v1",
  normalize(input, context) {
    const mode = input.mode ?? (input.event ? "events" : "updates");
    const data = input.data;
    const events: ChatEvent[] = [];
    const provider = { provider: "langchain", raw: { mode } };
    const suffix = stableSuffix(context.sequence, mode, input.event, input.name, input.run_id);
    const turnId = threadScopedTurnId(context.threadId, context.turnId);
    const eventContext: AdapterContext = { ...context, turnId };

    if (mode === "messages") {
      const tuple = Array.isArray(data) ? data : [data];
      const message = recordValue(tuple[0]);
      const metadata = recordValue(tuple[1]);
      const content = messageParts(message.content) || stringValue(message.text) || "";
      const nativeMessageId = stringValue(message.id);
      if (content) {
        events.push(event("item.delta", eventContext, suffix, {
          itemId: threadScopedEntityId(
            context.threadId,
            nativeMessageId,
            `assistant:${context.turnId ?? "turn"}`,
          ),
          delta: content,
        }, { ...provider, raw: { mode, metadata: jsonValue(metadata) } }));
      }
      const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
      for (const [index, toolCallInput] of toolCalls.entries()) {
        const toolCall = recordValue(toolCallInput);
        const nativeToolId = stringValue(toolCall.id);
        events.push(event("item.upsert", eventContext, `${suffix}:tool:${index}`, {
          id: threadScopedEntityId(
            context.threadId,
            nativeToolId,
            `tool:${context.turnId ?? "turn"}:${index}`,
          ),
          threadId: context.threadId,
          turnId,
          kind: "tool",
          role: "tool",
          status: "streaming",
          toolName: stringValue(toolCall.name) ?? "tool",
          input: jsonValue(toolCall.args),
          metadata: {
            langChainMode: mode,
            ...(nativeToolId ? { nativeItemId: nativeToolId } : {}),
          },
        }, provider));
      }
      return events;
    }

    if (mode === "updates") {
      const updates = recordValue(data);
      for (const [nodeName, nodeInput] of Object.entries(updates)) {
        const node = recordValue(nodeInput);
        const messages = Array.isArray(node.messages) ? node.messages : [];
        for (const [index, messageInput] of messages.entries()) {
          const message = recordValue(messageInput);
          const type = stringValue(message.type) ?? stringValue(message.role) ?? "system";
          const isTool = type.toLowerCase().includes("tool");
          const text = messageParts(message.content) || stringValue(message.text);
          const toolName = stringValue(message.name);
          const nativeMessageId = stringValue(message.id);
          events.push(event("item.upsert", eventContext, `${suffix}:${nodeName}:${index}`, {
            id: threadScopedEntityId(
              context.threadId,
              nativeMessageId,
              `langchain:${context.turnId ?? "turn"}:${nodeName}:${index}`,
            ),
            threadId: context.threadId,
            turnId,
            kind: isTool ? "tool" : "message",
            role: isTool ? "tool" : type.toLowerCase().includes("human") ? "user" : "assistant",
            status: "completed",
            ...(text ? { text } : {}),
            ...(toolName ? { toolName } : {}),
            ...(message.tool_calls !== undefined ? { output: jsonValue(message.tool_calls) } : {}),
            metadata: {
              langChainNode: nodeName,
              langChainMode: mode,
              ...(nativeMessageId ? { nativeItemId: nativeMessageId } : {}),
            },
          }, provider));
        }
      }
      return events;
    }

    if (mode === "custom") {
      events.push(event("surface.upsert", eventContext, suffix, {
        id: threadScopedEntityId(
          context.threadId,
          undefined,
          `langchain.custom:${context.turnId ?? "turn"}:${stableSuffix(input.name, context.sequence)}`,
        ),
        threadId: context.threadId,
        turnId,
        kind: stringValue(input.name) ?? "langchain.custom",
        schemaVersion: 1,
        revision: context.sequence ?? 1,
        status: "streaming",
        payload: jsonValue(data),
      }, provider));
      return events;
    }

    const eventName = stringValue(input.event) ?? "langchain_event";
    if (eventName.endsWith("_stream")) {
      const chunk = recordValue(data);
      const nestedChunk = recordValue(chunk.chunk);
      const content = messageParts(
        Object.keys(nestedChunk).length > 0 ? nestedChunk.content : chunk.chunk ?? chunk.content,
      ) || stringValue(nestedChunk.text) || stringValue(chunk.text) || "";
      if (content) {
        events.push(event("item.delta", eventContext, suffix, {
          itemId: threadScopedEntityId(
            context.threadId,
            undefined,
            `assistant:${context.turnId ?? "turn"}`,
          ),
          delta: content,
        }, provider));
      }
    } else if (eventName.endsWith("_end")) {
      events.push(event("turn.status", eventContext, suffix, {
        status: "completed",
        completedAt: context.occurredAt ?? new Date().toISOString(),
      }, provider));
    } else if (eventName.endsWith("_error")) {
      const errorData = recordValue(data);
      events.push(event("turn.status", eventContext, suffix, {
        status: "failed",
        error: stringValue(errorData.message) ?? stringValue(data) ?? eventName,
      }, provider));
    }
    return events;
  },
};
