import {
  jsonValue,
  numberValue,
  recordValue,
  stringValue,
  type AdapterContext,
  type ChatEvent,
  type ChatItem,
  type ChatTransportAdapter,
  type ItemStatus,
  type TurnStatus,
} from "../protocol.js";
import { event, stableSuffix, threadScopedEntityId, threadScopedTurnId } from "./shared.js";

export interface CodexAppServerMessage {
  id?: string | number;
  method?: string;
  params?: unknown;
}

function codexStatus(value: unknown): TurnStatus {
  switch (String(value ?? "").toLowerCase()) {
    case "completed": return "completed";
    case "failed": return "failed";
    case "interrupted": return "interrupted";
    case "cancelled": return "cancelled";
    case "waitingonapproval": return "waiting_approval";
    case "waitingonuserinput": return "waiting_input";
    default: return "running";
  }
}

function itemStatus(value: unknown): ItemStatus {
  switch (String(value ?? "").toLowerCase()) {
    case "completed": return "completed";
    case "failed": return "failed";
    case "declined": return "declined";
    case "pending": return "pending";
    default: return "streaming";
  }
}

function itemKind(value: unknown): ChatItem["kind"] {
  switch (String(value ?? "")) {
    case "userMessage":
    case "agentMessage": return "message";
    case "reasoning": return "reasoning";
    case "plan": return "plan";
    case "commandExecution": return "command";
    case "fileChange": return "file_change";
    case "mcpToolCall":
    case "dynamicToolCall": return "tool";
    case "collabAgentToolCall":
    case "subAgentActivity": return "subagent";
    case "webSearch":
    case "imageView":
    case "imageGeneration":
    case "review":
    case "compaction": return "system";
    default: return "unknown";
  }
}

function textFromItem(item: Record<string, unknown>): string | undefined {
  const direct = stringValue(item.text) ?? stringValue(item.content) ?? stringValue(item.summary) ?? stringValue(item.message);
  if (direct) return direct;
  const content = Array.isArray(item.content)
    ? item.content
    : Array.isArray(item.summary)
      ? item.summary
      : [];
  return content
    .map((part) => {
      if (typeof part === "string") return part;
      const value = recordValue(part);
      return stringValue(value.text) ?? stringValue(value.content) ?? "";
    })
    .filter(Boolean)
    .join("\n") || undefined;
}

function normalizeItem(itemInput: unknown, context: AdapterContext): ChatItem {
  const item = recordValue(itemInput);
  const nativeType = stringValue(item.type) ?? "unknown";
  const nativeItemId = stringValue(item.id);
  const id = threadScopedEntityId(
    context.threadId,
    nativeItemId,
    `codex-item:${stableSuffix(nativeType, context.sequence)}`,
  );
  const role = nativeType === "userMessage" ? "user" : nativeType === "agentMessage" ? "assistant" : undefined;
  const text = textFromItem(item);
  const command = stringValue(item.command);
  const toolName = stringValue(item.name) ?? stringValue(item.tool);
  const input = item.input ?? item.arguments;
  const output = item.output ?? item.result ?? item.aggregatedOutput ?? item.contentItems ?? item.error ?? item.changes;
  return {
    id,
    threadId: context.threadId,
    turnId: threadScopedTurnId(context.threadId, context.turnId ?? stringValue(item.turnId)),
    kind: itemKind(nativeType),
    status: itemStatus(item.status),
    ...(role ? { role } : {}),
    ...(text ? { text } : {}),
    ...(command ? { title: command } : {}),
    ...(toolName ? { toolName } : {}),
    ...(input !== undefined ? { input: jsonValue(input) } : {}),
    ...(output !== undefined ? { output: jsonValue(output) } : {}),
    ...(typeof item.success === "boolean"
      ? { isError: !item.success }
      : item.error !== null && item.error !== undefined || String(item.status ?? "").toLowerCase() === "failed"
        ? { isError: true }
        : {}),
    metadata: {
      nativeType,
      ...(nativeItemId ? { nativeItemId } : {}),
    },
  };
}

function interactionKind(method: string): "approval" | "question" | "elicitation" {
  if (method === "item/tool/requestUserInput") return "question";
  if (method === "mcpServer/elicitation/request") return "elicitation";
  return "approval";
}

export const codexAppServerAdapter: ChatTransportAdapter<CodexAppServerMessage> = {
  id: "codex-app-server-v2",
  normalize(input, context) {
    const method = stringValue(input.method);
    if (!method) return [];
    const params = recordValue(input.params);
    const thread = recordValue(params.thread);
    const turn = recordValue(params.turn);
    const nativeThreadId = stringValue(params.threadId) ?? stringValue(thread.id);
    const nativeTurnId = stringValue(params.turnId) ?? stringValue(turn.id) ?? context.turnId;
    const scopedTurnId = nativeTurnId ? threadScopedTurnId(context.threadId, nativeTurnId) : undefined;
    const eventContext: AdapterContext = {
      ...context,
      ...(scopedTurnId ? { turnId: scopedTurnId } : {}),
    };
    const provider = {
      provider: "codex",
      ...(nativeThreadId ? { nativeThreadId } : {}),
      ...(nativeTurnId ? { nativeTurnId } : {}),
    };
    const suffix = stableSuffix(context.sequence, method, stringValue(recordValue(params.item).id), String(input.id ?? ""));

    if (method === "thread/started") {
      const title = stringValue(thread.name) ?? stringValue(thread.title);
      return [event("thread.upsert", eventContext, suffix, {
        id: context.threadId,
        appKey: context.appKey ?? "codex",
        organizationId: context.organizationId ?? "unknown",
        ...(title ? { title } : {}),
        status: "active",
        provider,
        metadata: { transport: "codex-app-server" },
      }, provider)];
    }

    if (method === "turn/started") {
      const turnId = threadScopedTurnId(context.threadId, nativeTurnId);
      return [event("turn.upsert", { ...eventContext, turnId }, suffix, {
        id: turnId,
        threadId: context.threadId,
        status: "running",
        itemIds: [],
        startedAt: context.occurredAt ?? new Date().toISOString(),
        provider,
      }, provider)];
    }

    if (method === "turn/completed") {
      const error = stringValue(params.error);
      return [event("turn.status", eventContext, suffix, {
        status: codexStatus(turn.status ?? params.status),
        completedAt: context.occurredAt ?? new Date().toISOString(),
        ...(error ? { error } : {}),
      }, provider)];
    }

    if (method === "item/started" || method === "item/completed") {
      const item = normalizeItem(params.item, eventContext);
      return [event("item.upsert", { ...eventContext, turnId: item.turnId }, suffix, item, provider)];
    }

    const deltaMethods: Record<string, { kind: ChatItem["kind"]; field: "text" | "output" }> = {
      "item/agentMessage/delta": { kind: "message", field: "text" },
      "item/plan/delta": { kind: "plan", field: "text" },
      "item/reasoning/summaryTextDelta": { kind: "reasoning", field: "text" },
      "item/reasoning/textDelta": { kind: "reasoning", field: "text" },
      "item/commandExecution/outputDelta": { kind: "command", field: "output" },
      "item/fileChange/outputDelta": { kind: "file_change", field: "output" },
    };
    const deltaConfig = deltaMethods[method];
    if (deltaConfig) {
      const nativeItemId = stringValue(params.itemId) ?? stringValue(recordValue(params.item).id);
      const itemId = threadScopedEntityId(
        context.threadId,
        nativeItemId,
        `${deltaConfig.kind}:${nativeTurnId ?? "turn"}`,
      );
      const delta = stringValue(params.delta) ?? stringValue(params.text) ?? "";
      if (!delta) return [];
      return [event("item.delta", eventContext, suffix, { itemId, delta, field: deltaConfig.field }, provider)];
    }

    if (method === "turn/plan/updated" || method === "turn/diff/updated") {
      const kind = method === "turn/plan/updated" ? "codex.plan" : "codex.diff";
      const revision = numberValue(params.revision) ?? context.sequence ?? 1;
      return [event("surface.upsert", eventContext, suffix, {
        id: threadScopedEntityId(context.threadId, undefined, `${kind}:${nativeTurnId ?? "thread"}`),
        threadId: context.threadId,
        ...(scopedTurnId ? { turnId: scopedTurnId } : {}),
        kind,
        schemaVersion: 1,
        revision,
        status: "streaming",
        payload: jsonValue(params),
      }, provider)];
    }

    if (
      method === "item/commandExecution/requestApproval"
      || method === "item/fileChange/requestApproval"
      || method === "item/permissions/requestApproval"
      || method === "item/tool/requestUserInput"
      || method === "mcpServer/elicitation/request"
      || method === "applyPatchApproval"
      || method === "execCommandApproval"
    ) {
      const requestId = String(input.id ?? stringValue(params.requestId) ?? suffix);
      const nativeItemId = stringValue(params.itemId);
      const description = stringValue(params.reason) ?? stringValue(params.message);
      return [event("interaction.requested", eventContext, suffix, {
        id: threadScopedEntityId(context.threadId, undefined, `codex-request:${requestId}`),
        threadId: context.threadId,
        turnId: threadScopedTurnId(context.threadId, nativeTurnId),
        ...(nativeItemId ? { itemId: threadScopedEntityId(context.threadId, nativeItemId, nativeItemId) } : {}),
        kind: interactionKind(method),
        status: "pending",
        title: method === "item/tool/requestUserInput" ? "Codex needs input" : "Codex requires approval",
        ...(description ? { description } : {}),
        payload: {
          method,
          requestId,
          ...(nativeItemId ? { itemId: nativeItemId } : {}),
        },
        ...(Array.isArray(params.availableDecisions)
          ? { availableDecisions: params.availableDecisions.map(String) }
          : {}),
        createdAt: context.occurredAt ?? new Date().toISOString(),
      }, provider)];
    }

    if (method === "serverRequest/resolved") {
      const requestId = String(params.requestId ?? params.id ?? `request:${stableSuffix(context.sequence)}`);
      return [event("interaction.resolved", eventContext, suffix, {
        interactionId: threadScopedEntityId(context.threadId, undefined, `codex-request:${requestId}`),
        resolvedAt: context.occurredAt ?? new Date().toISOString(),
      }, provider)];
    }

    if (method === "thread/tokenUsage/updated") {
      const tokenUsage = recordValue(params.tokenUsage ?? params.usage);
      const usage = recordValue(tokenUsage.total ?? tokenUsage);
      const inputTokens = numberValue(usage.inputTokens);
      const outputTokens = numberValue(usage.outputTokens);
      const totalTokens = numberValue(usage.totalTokens);
      return [event("usage.updated", eventContext, suffix, {
        ...(inputTokens !== undefined ? { inputTokens } : {}),
        ...(outputTokens !== undefined ? { outputTokens } : {}),
        ...(totalTokens !== undefined ? { totalTokens } : {}),
      }, provider)];
    }

    if (method === "warning" || method === "error" || method === "guardianWarning" || method === "configWarning") {
      return [event("warning", eventContext, suffix, {
        code: method,
        message: stringValue(params.message) ?? stringValue(params.error) ?? method,
      }, provider)];
    }

    return [];
  },
};
