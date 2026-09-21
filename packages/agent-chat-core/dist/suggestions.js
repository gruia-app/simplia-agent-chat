/**
 * Chat-first home suggestions. The contract is provider-neutral: applications
 * own the curated entries and the account snapshot shape; this module only
 * validates, dedupes and orders them deterministically.
 */
const SUGGESTION_ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/u;
const MAX_LABEL_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 280;
export const DEFAULT_SUGGESTION_LIMIT = 5;
function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}
function isNonEmptyString(value) {
    return typeof value === "string" && value.trim().length > 0;
}
/**
 * Structural validation for one suggestion. Returns a normalized frozen copy
 * with trimmed strings, or `undefined` when the entry must be dropped.
 */
export function normalizeChatSuggestion(value) {
    if (!isPlainObject(value))
        return undefined;
    const { id, label, prompt, description } = value;
    if (typeof id !== "string" || !SUGGESTION_ID_PATTERN.test(id.trim()))
        return undefined;
    if (!isNonEmptyString(label) || label.trim().length > MAX_LABEL_LENGTH)
        return undefined;
    if (!isNonEmptyString(prompt))
        return undefined;
    if (description !== undefined && (typeof description !== "string" || description.trim().length > MAX_DESCRIPTION_LENGTH)) {
        return undefined;
    }
    const suggestion = {
        id: id.trim(),
        label: label.trim(),
        prompt: prompt.trim(),
    };
    if (typeof description === "string" && description.trim().length > 0) {
        suggestion.description = description.trim();
    }
    return Object.freeze(suggestion);
}
/**
 * Validate and freeze a registry. Static entries are normalized and deduped
 * by `id`; a duplicate id or an entry that cannot be normalized fails closed
 * instead of silently dropping half of the curated row.
 */
export function createChatSuggestionRegistry(input) {
    if (!isPlainObject(input) || !Array.isArray(input.staticSuggestions)) {
        return { ok: false, reason: "invalid_suggestion" };
    }
    if (input.derive !== undefined && typeof input.derive !== "function") {
        return { ok: false, reason: "invalid_derive" };
    }
    const seen = new Set();
    const staticSuggestions = [];
    for (const entry of input.staticSuggestions) {
        const suggestion = normalizeChatSuggestion(entry);
        if (!suggestion)
            return { ok: false, reason: "invalid_suggestion" };
        if (seen.has(suggestion.id))
            return { ok: false, reason: "duplicate_id" };
        seen.add(suggestion.id);
        staticSuggestions.push(suggestion);
    }
    const registry = {
        staticSuggestions: Object.freeze(staticSuggestions),
        ...(input.derive ? { derive: input.derive } : {}),
    };
    return { ok: true, registry: Object.freeze(registry) };
}
/**
 * Resolve the chip row for one render: validated static entries in declared
 * order, then at most one derived entry appended last. A `derive` that throws
 * or returns an invalid shape contributes nothing; the static row still
 * renders. Duplicate ids keep the first occurrence.
 */
export function resolveChatSuggestions(registry, options) {
    const limit = options?.limit === undefined
        ? DEFAULT_SUGGESTION_LIMIT
        : Math.max(0, Math.floor(options.limit));
    const seen = new Set();
    const resolved = [];
    const push = (value) => {
        if (resolved.length >= limit)
            return;
        const suggestion = normalizeChatSuggestion(value);
        if (!suggestion || seen.has(suggestion.id))
            return;
        seen.add(suggestion.id);
        resolved.push(suggestion);
    };
    for (const entry of registry.staticSuggestions)
        push(entry);
    if (registry.derive && resolved.length < limit) {
        try {
            push(registry.derive(options?.context));
        }
        catch {
            // A throwing derive must not break the composer row.
        }
    }
    return resolved;
}
/**
 * Factory for the canonical one-dynamic-suggestion derive: empty account wins,
 * then quota pressure, then the app fallback. Returns `undefined` when no
 * condition holds so the row stays purely static.
 */
export function createAccountSnapshotDerive(options) {
    const threshold = options.quotaWarningThreshold ?? 0.8;
    return (snapshot) => {
        if (!isPlainObject(snapshot))
            return undefined;
        if (snapshot.isEmpty === true)
            return options.emptyAccountSuggestion;
        if (typeof snapshot.quotaUsedRatio === "number"
            && Number.isFinite(snapshot.quotaUsedRatio)
            && snapshot.quotaUsedRatio >= threshold) {
            const candidate = options.quotaWarningSuggestion;
            return typeof candidate === "function" ? candidate(snapshot) : candidate;
        }
        return options.fallback?.(snapshot);
    };
}
//# sourceMappingURL=suggestions.js.map