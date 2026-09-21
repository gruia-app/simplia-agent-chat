import type { ChatUsage } from "./protocol.js";
import type { ChatState } from "./state.js";
import type { ChatRuntime } from "./runtime.js";

/**
 * Per-tenant usage metering for chat turns. Applications own the quota system;
 * this module only derives one event per `usage.updated` delta so quota
 * pipelines get `{ organization_id, thread_id, delta }` without re-diffing
 * cumulative counters themselves. It is the chat-turn analogue of the voice
 * `VoiceUsageEvent` metering hook.
 */

export interface ChatUsageDelta {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  costUsd?: number;
}

export interface ChatUsageMeterEvent {
  threadId: string;
  /** Tenant key (`organizationId` on the thread) for per-tenant quotas. */
  organizationId?: string;
  /** Per-key delta since the previous state. May be negative on corrections. */
  delta: ChatUsageDelta;
  /** Cumulative usage after the change, as reported by the reducer. */
  usage: ChatUsage;
}

const USAGE_KEYS = ["inputTokens", "outputTokens", "totalTokens", "costUsd"] as const;

/** Per-key delta between two cumulative usage snapshots. Empty when unchanged. */
export function diffChatUsage(previous: ChatUsage | undefined, next: ChatUsage | undefined): ChatUsageDelta {
  const delta: ChatUsageDelta = {};
  if (!next) return delta;
  for (const key of USAGE_KEYS) {
    const after = next[key];
    if (after === undefined) continue;
    const change = after - (previous?.[key] ?? 0);
    if (change !== 0) delta[key] = change;
  }
  return delta;
}

function hasDelta(delta: ChatUsageDelta): boolean {
  return USAGE_KEYS.some((key) => delta[key] !== undefined);
}

/**
 * Collect one meter event per thread whose cumulative usage changed between
 * two states. Pure: callers choose when to emit (per `runtime.apply`, per
 * flush, or batched).
 */
export function collectUsageMeterEvents(
  previous: ChatState,
  next: ChatState,
): ChatUsageMeterEvent[] {
  const events: ChatUsageMeterEvent[] = [];
  for (const [threadId, usage] of Object.entries(next.usageByThread)) {
    const delta = diffChatUsage(previous.usageByThread[threadId], usage);
    if (!hasDelta(delta)) continue;
    const organizationId = next.threads[threadId]?.organizationId;
    events.push({
      threadId,
      ...(organizationId ? { organizationId } : {}),
      delta,
      usage,
    });
  }
  return events;
}

/**
 * Subscribe a meter to a runtime. Emits every usage delta, in apply order,
 * until the returned unsubscribe is called. A throwing `emit` propagates to the
 * runtime's `onListenerError` (or is contained like any other listener).
 */
export function watchChatUsage(
  runtime: ChatRuntime,
  emit: (event: ChatUsageMeterEvent) => void,
): () => void {
  let previous = runtime.getState();
  return runtime.subscribe(() => {
    const next = runtime.getState();
    const events = collectUsageMeterEvents(previous, next);
    previous = next;
    for (const event of events) emit(event);
  });
}
