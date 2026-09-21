const USAGE_KEYS = ["inputTokens", "outputTokens", "totalTokens", "costUsd"];
/** Per-key delta between two cumulative usage snapshots. Empty when unchanged. */
export function diffChatUsage(previous, next) {
    const delta = {};
    if (!next)
        return delta;
    for (const key of USAGE_KEYS) {
        const after = next[key];
        if (after === undefined)
            continue;
        const change = after - (previous?.[key] ?? 0);
        if (change !== 0)
            delta[key] = change;
    }
    return delta;
}
function hasDelta(delta) {
    return USAGE_KEYS.some((key) => delta[key] !== undefined);
}
/**
 * Collect one meter event per thread whose cumulative usage changed between
 * two states. Pure: callers choose when to emit (per `runtime.apply`, per
 * flush, or batched).
 */
export function collectUsageMeterEvents(previous, next) {
    const events = [];
    for (const [threadId, usage] of Object.entries(next.usageByThread)) {
        const delta = diffChatUsage(previous.usageByThread[threadId], usage);
        if (!hasDelta(delta))
            continue;
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
export function watchChatUsage(runtime, emit) {
    let previous = runtime.getState();
    return runtime.subscribe(() => {
        const next = runtime.getState();
        const events = collectUsageMeterEvents(previous, next);
        previous = next;
        for (const event of events)
            emit(event);
    });
}
//# sourceMappingURL=usage-meter.js.map