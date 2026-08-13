import {
  jsonValue,
  recordValue,
  stringValue,
  type AdapterContext,
  type ChatEvent,
  type ChatTransportAdapter,
} from "../protocol.js";
import { event, stableSuffix } from "./shared.js";

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

    if (mode === "messages") {
      const tuple = Array.isArray(data) ? data : [data];
      const message = recordValue(tuple[0]);
      const metadata = recordValue(tuple[1]);
      const content = messageParts(message.content) || stringValue(message.text) || "";
      if (content) {
        events.push(event("item.delta", context, suffix, {
          itemId: stringValue(message.id) ?? `assistant:${context.turnId ?? context.threadId}`,
          delta: content,
        }, { ...provider, raw: { mode, metadata: jsonValue(metadata) } }));
      }
      const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
      for (const [index, toolCallInput] of toolCalls.entries()) {
        const toolCall = recordValue(toolCallInput);
        events.push(event("item.upsert", context, `${suffix}:tool:${index}`, {
          id: stringValue(toolCall.id) ?? `tool:${context.turnId ?? context.threadId}:${index}`,
          threadId: context.threadId,
          turnId: context.turnId ?? "unknown",
          kind: "tool",
          role: "tool",
          status: "streaming",
          toolName: stringValue(toolCall.name) ?? "tool",
          input: jsonValue(toolCall.args),
          metadata: { langChainMode: mode },
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
          events.push(event("item.upsert", context, `${suffix}:${nodeName}:${index}`, {
            id: stringValue(message.id) ?? `langchain:${context.turnId ?? context.threadId}:${nodeName}:${index}`,
            threadId: context.threadId,
            turnId: context.turnId ?? "unknown",
            kind: isTool ? "tool" : "message",
            role: isTool ? "tool" : type.toLowerCase().includes("human") ? "user" : "assistant",
            status: "completed",
            ...(text ? { text } : {}),
            ...(toolName ? { toolName } : {}),
            ...(message.tool_calls !== undefined ? { output: jsonValue(message.tool_calls) } : {}),
            metadata: { langChainNode: nodeName, langChainMode: mode },
          }, provider));
        }
      }
      return events;
    }

    if (mode === "custom") {
      events.push(event("surface.upsert", context, suffix, {
        id: `langchain.custom:${context.turnId ?? context.threadId}:${stableSuffix(input.name, context.sequence)}`,
        threadId: context.threadId,
        ...(context.turnId ? { turnId: context.turnId } : {}),
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
        events.push(event("item.delta", context, suffix, {
          itemId: `assistant:${context.turnId ?? context.threadId}`,
          delta: content,
        }, provider));
      }
    } else if (eventName.endsWith("_end")) {
      events.push(event("turn.status", context, suffix, {
        status: "completed",
        completedAt: context.occurredAt ?? new Date().toISOString(),
      }, provider));
    } else if (eventName.endsWith("_error")) {
      const errorData = recordValue(data);
      events.push(event("turn.status", context, suffix, {
        status: "failed",
        error: stringValue(errorData.message) ?? stringValue(data) ?? eventName,
      }, provider));
    }
    return events;
  },
};
