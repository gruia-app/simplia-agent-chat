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
/** Per-key delta between two cumulative usage snapshots. Empty when unchanged. */
export declare function diffChatUsage(previous: ChatUsage | undefined, next: ChatUsage | undefined): ChatUsageDelta;
/**
 * Collect one meter event per thread whose cumulative usage changed between
 * two states. Pure: callers choose when to emit (per `runtime.apply`, per
 * flush, or batched).
 */
export declare function collectUsageMeterEvents(previous: ChatState, next: ChatState): ChatUsageMeterEvent[];
/**
 * Subscribe a meter to a runtime. Emits every usage delta, in apply order,
 * until the returned unsubscribe is called. A throwing `emit` propagates to the
 * runtime's `onListenerError` (or is contained like any other listener).
 */
export declare function watchChatUsage(runtime: ChatRuntime, emit: (event: ChatUsageMeterEvent) => void): () => void;
//# sourceMappingURL=usage-meter.d.ts.map