import {
  jsonValue,
  numberValue,
  recordValue,
  stringValue,
  type AdapterContext,
  type ChatEvent,
  type ChatTransportAdapter,
} from "../protocol.js";
import { event, stableSuffix } from "./shared.js";

export interface OpenAiCompatibleChunk {
  id?: string;
  model?: string;
  provider?: string;
  choices?: unknown[];
  usage?: unknown;
  error?: unknown;
}

export interface OpenAiCompatibleAdapterOptions {
  id?: string;
  provider?: string;
}

export function createOpenAiCompatibleAdapter(
  options: OpenAiCompatibleAdapterOptions = {},
): ChatTransportAdapter<OpenAiCompatibleChunk | "[DONE]"> {
  const adapterId = options.id ?? "openai-compatible-v1";
  const fallbackProvider = options.provider ?? "openai-compatible";
  return {
    id: adapterId,
    normalize(input, context) {
      if (input === "[DONE]") {
        return [event("turn.status", context, stableSuffix(context.sequence, "done"), {
          status: "completed",
          completedAt: context.occurredAt ?? new Date().toISOString(),
        }, { provider: fallbackProvider })];
      }

      const model = stringValue(input.model);
      const provider = {
        provider: stringValue(input.provider) ?? fallbackProvider,
        ...(model ? { model } : {}),
      };
      const suffix = stableSuffix(context.sequence, input.id);
      const events: ChatEvent[] = [];
      const errorRecord = recordValue(input.error);
      if (Object.keys(errorRecord).length > 0 || typeof input.error === "string") {
        const message = stringValue(errorRecord.message) ?? stringValue(input.error) ?? "Provider error";
        events.push(event("warning", context, `${suffix}:error`, {
          code: stringValue(errorRecord.code) ?? "provider_error",
          message,
          detail: jsonValue(input.error),
        }, provider));
        events.push(event("turn.status", context, `${suffix}:failed`, { status: "failed", error: message }, provider));
        return events;
      }

      for (const [choiceIndex, choiceInput] of (input.choices ?? []).entries()) {
        const choice = recordValue(choiceInput);
        const delta = recordValue(choice.delta);
        const message = recordValue(choice.message);
        const content = stringValue(delta.content) ?? stringValue(message.content);
        if (content) {
          events.push(event("item.delta", context, `${suffix}:choice:${choiceIndex}:text`, {
            itemId: `assistant:${context.turnId ?? context.threadId}:${choiceIndex}`,
            delta: content,
          }, provider));
        }

        const toolCalls = Array.isArray(delta.tool_calls)
          ? delta.tool_calls
          : Array.isArray(message.tool_calls)
            ? message.tool_calls
            : [];
        for (const [toolIndex, toolCallInput] of toolCalls.entries()) {
          const toolCall = recordValue(toolCallInput);
          const fn = recordValue(toolCall.function);
          const index = numberValue(toolCall.index) ?? toolIndex;
          const toolId = stringValue(toolCall.id) ?? `tool-${choiceIndex}-${index}`;
          const argumentsDelta = stringValue(fn.arguments) ?? "";
          const toolName = stringValue(fn.name);
          events.push(event("item.upsert", context, `${suffix}:tool:${choiceIndex}:${index}`, {
            id: `tool:${context.turnId ?? context.threadId}:${choiceIndex}:${index}`,
            threadId: context.threadId,
            turnId: context.turnId ?? "unknown",
            kind: "tool",
            role: "tool",
            status: choice.finish_reason === "tool_calls" ? "completed" : "streaming",
            ...(toolName ? { toolName } : {}),
            input: { toolCallId: toolId, arguments: argumentsDelta },
            metadata: { choiceIndex, toolIndex: index },
          }, provider));
        }

        const finishReason = stringValue(choice.finish_reason);
        if (finishReason) {
          const status = finishReason === "stop" || finishReason === "tool_calls" ? "completed" : "failed";
          events.push(event("turn.status", context, `${suffix}:choice:${choiceIndex}:finish`, {
            status,
            completedAt: context.occurredAt ?? new Date().toISOString(),
            ...(status === "failed" ? { error: `finish_reason:${finishReason}` } : {}),
          }, provider));
        }
      }

      const usage = recordValue(input.usage);
      if (Object.keys(usage).length > 0) {
        const inputTokens = numberValue(usage.prompt_tokens);
        const outputTokens = numberValue(usage.completion_tokens);
        const totalTokens = numberValue(usage.total_tokens);
        const costUsd = numberValue(usage.cost);
        events.push(event("usage.updated", context, `${suffix}:usage`, {
          ...(inputTokens !== undefined ? { inputTokens } : {}),
          ...(outputTokens !== undefined ? { outputTokens } : {}),
          ...(totalTokens !== undefined ? { totalTokens } : {}),
          ...(costUsd !== undefined ? { costUsd } : {}),
        }, provider));
      }
      return events;
    },
  };
}

export const openRouterAdapter = createOpenAiCompatibleAdapter({
  id: "openrouter-chat-completions-v1",
  provider: "openrouter",
});
