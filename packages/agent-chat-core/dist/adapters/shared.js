import { eventBase, recordValue, stringValue, } from "../protocol.js";
export function event(type, context, suffix, payload, provider) {
    return {
        ...eventBase(type, context, suffix),
        ...(provider ? { provider } : {}),
        payload,
    };
}
export function providerFrom(input, fallback) {
    const value = recordValue(input);
    const model = stringValue(value.model);
    const reasoningEffort = stringValue(value.reasoning_effort);
    const sessionId = stringValue(value.session_id);
    return {
        provider: stringValue(value.backend_provider) ?? stringValue(value.cli_provider) ?? stringValue(value.provider) ?? fallback,
        ...(model ? { model } : {}),
        ...(reasoningEffort ? { reasoningEffort } : {}),
        ...(sessionId ? { sessionId } : {}),
    };
}
export function stableSuffix(...parts) {
    return parts.map((part) => String(part ?? "unknown").replace(/[^a-zA-Z0-9._:-]+/g, "_")).join(":");
}
export function scopeToThread(threadId, nativeId) {
    return nativeId === threadId || nativeId.startsWith(`${threadId}:`)
        ? nativeId
        : `${threadId}:${nativeId}`;
}
export function threadScopedTurnId(threadId, nativeTurnId) {
    return nativeTurnId && nativeTurnId.trim()
        ? scopeToThread(threadId, nativeTurnId.trim())
        : `${threadId}:turn`;
}
export function threadScopedEntityId(threadId, nativeId, fallback) {
    return scopeToThread(threadId, nativeId && nativeId.trim() ? nativeId.trim() : fallback);
}
//# sourceMappingURL=shared.js.map