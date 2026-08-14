import {
  jsonValue,
  numberValue,
  recordValue,
  stringValue,
  type AdapterContext,
  type ChatEvent,
  type ChatTransportAdapter,
} from "@simplia/agent-chat-core/protocol";
import {
  event,
  providerFrom,
  threadScopedEntityId,
  threadScopedTurnId,
} from "@simplia/agent-chat-core/adapters/shared";

export interface Acv2DirectChatExchange {
  /** Stable client-generated ID for one user/assistant exchange. */
  exchange_id: string;
  role?: string;
  provider?: string;
  model?: string;
  reasoning_effort?: string;
  request: { message?: unknown };
  response: {
    response?: unknown;
    session_id?: unknown;
    conversation_id?: unknown;
    tokens_used?: unknown;
    cost_usd?: unknown;
    tool_calls?: unknown;
  };
}

function normalizedUsage(response: Record<string, unknown>): {
  totalTokens?: number;
  costUsd?: number;
} {
  const tokens = numberValue(response.tokens_used);
  const costUsd = numberValue(response.cost_usd);
  return {
    ...(tokens !== undefined ? { totalTokens: Math.max(0, Math.trunc(tokens)) } : {}),
    ...(costUsd !== undefined ? { costUsd: Math.max(0, costUsd) } : {}),
  };
}

function textValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export const acv2DirectChatAdapter: ChatTransportAdapter<Acv2DirectChatExchange> = {
  id: "acv2-direct-chat-v1",
  normalize(input, baseContext) {
    const envelope = recordValue(input);
    const request = recordValue(envelope.request);
    const response = recordValue(envelope.response);
    const nativeTurnId = stringValue(envelope.exchange_id);
    if (!nativeTurnId) {
      return [event("warning", baseContext, "direct:missing-exchange-id", {
        code: "acv2_direct_missing_exchange_id",
        message: "ACV2 direct chat exchange requires a stable exchange ID.",
      })];
    }

    const turnId = threadScopedTurnId(baseContext.threadId, nativeTurnId);
    // A synchronous response expands into several events. Reusing one incoming
    // stream sequence would make the reducer reject every event after the first.
    const context: AdapterContext = {
      source: baseContext.source,
      threadId: baseContext.threadId,
      ...(baseContext.appKey ? { appKey: baseContext.appKey } : {}),
      ...(baseContext.organizationId ? { organizationId: baseContext.organizationId } : {}),
      turnId,
      occurredAt: baseContext.occurredAt ?? new Date().toISOString(),
    };
    const conversationId = stringValue(response.conversation_id);
    const sessionId = stringValue(response.session_id);
    const agentRole = stringValue(envelope.role);
    const provider = {
      ...providerFrom({
        provider: envelope.provider,
        model: envelope.model,
        reasoning_effort: envelope.reasoning_effort,
        session_id: sessionId,
      }, "acv2"),
      ...(conversationId ? { nativeThreadId: conversationId } : {}),
      nativeTurnId,
    };
    const userItemId = threadScopedEntityId(baseContext.threadId, undefined, `user:${nativeTurnId}`);
    const assistantItemId = threadScopedEntityId(
      baseContext.threadId,
      undefined,
      `assistant:${nativeTurnId}`,
    );
    const rawToolCalls = Array.isArray(response.tool_calls) ? response.tool_calls : [];
    const toolItems = rawToolCalls.flatMap((rawToolCall, index) => {
      const toolCall = recordValue(rawToolCall);
      const toolName = stringValue(toolCall.name) ?? stringValue(toolCall.tool_name);
      if (!toolName) return [];
      const nativeToolId = stringValue(toolCall.id);
      const itemId = threadScopedEntityId(
        baseContext.threadId,
        undefined,
        `tool:${nativeTurnId}:${nativeToolId ?? "anonymous"}:${index}`,
      );
      return [{
        itemId,
        event: event("item.upsert", context, `direct:tool:${index}`, {
          id: itemId,
          threadId: baseContext.threadId,
          turnId,
          kind: "tool",
          role: "tool",
          status: "completed",
          title: toolName,
          toolName,
          input: jsonValue(toolCall.input),
          metadata: {
            transport: "agents.chat",
            ...(nativeToolId ? { nativeItemId: nativeToolId } : {}),
          },
        }, provider),
      }];
    });
    const itemIds = [userItemId, ...toolItems.map((item) => item.itemId), assistantItemId];
    const completedAt = context.occurredAt ?? new Date().toISOString();
    const usage = normalizedUsage(response);
    const events: ChatEvent[] = [
      event("turn.upsert", context, "direct:turn", {
        id: turnId,
        threadId: baseContext.threadId,
        status: "completed",
        itemIds,
        completedAt,
        provider,
      }, provider),
      event("item.upsert", context, "direct:user", {
        id: userItemId,
        threadId: baseContext.threadId,
        turnId,
        kind: "message",
        role: "user",
        status: "completed",
        text: textValue(request.message),
        completedAt,
        metadata: { transport: "agents.chat" },
      }, provider),
      ...toolItems.map((item) => item.event),
      event("item.upsert", context, "direct:assistant", {
        id: assistantItemId,
        threadId: baseContext.threadId,
        turnId,
        kind: "message",
        role: "assistant",
        status: "completed",
        text: textValue(response.response),
        completedAt,
        metadata: {
          transport: "agents.chat",
          ...(agentRole ? { agentRole } : {}),
          ...(conversationId ? { conversationId } : {}),
        },
      }, provider),
    ];

    if (usage.totalTokens !== undefined || usage.costUsd !== undefined) {
      events.push(event("usage.updated", context, "direct:usage", usage, provider));
    }
    return events;
  },
};
