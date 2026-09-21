/**
 * Limit-reached notices. The contract is provider-neutral: applications own the
 * quota decision and the action target; this module only validates the notice
 * shape so a malformed limit payload degrades to "no notice" instead of a
 * half-rendered upgrade prompt.
 */
const LIMIT_KINDS = new Set([
    "quota_exceeded",
    "plan_required",
    "rate_limited",
    "custom",
]);
const MAX_LIMIT_MESSAGE = 280;
const MAX_LIMIT_LABEL = 80;
const MAX_LIMIT_ACTION_ID = 120;
function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}
function boundedString(value, max) {
    if (typeof value !== "string")
        return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 && trimmed.length <= max ? trimmed : undefined;
}
/**
 * Normalize untrusted host input into a `ChatLimitNotice`, or `undefined` when
 * the entry must be dropped. Missing/invalid `kind` or `message` fails closed.
 */
export function normalizeChatLimitNotice(value) {
    if (!isPlainObject(value))
        return undefined;
    const kind = typeof value.kind === "string" && LIMIT_KINDS.has(value.kind)
        ? value.kind
        : undefined;
    const message = boundedString(value.message, MAX_LIMIT_MESSAGE);
    if (!kind || !message)
        return undefined;
    if (value.actionLabel !== undefined && !boundedString(value.actionLabel, MAX_LIMIT_LABEL))
        return undefined;
    if (value.actionId !== undefined && !boundedString(value.actionId, MAX_LIMIT_ACTION_ID))
        return undefined;
    const actionLabel = boundedString(value.actionLabel, MAX_LIMIT_LABEL);
    const actionId = boundedString(value.actionId, MAX_LIMIT_ACTION_ID);
    const notice = { kind, message };
    if (actionLabel)
        notice.actionLabel = actionLabel;
    if (actionId)
        notice.actionId = actionId;
    if (value.blocking === false)
        notice.blocking = false;
    return Object.freeze(notice);
}
//# sourceMappingURL=limits.js.map