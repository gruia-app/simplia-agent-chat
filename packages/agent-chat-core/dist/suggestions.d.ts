/**
 * Chat-first home suggestions. The contract is provider-neutral: applications
 * own the curated entries and the account snapshot shape; this module only
 * validates, dedupes and orders them deterministically.
 */
export interface ChatSuggestion {
    /** Stable per-registry identifier. Used for dedupe and telemetry keys. */
    id: string;
    /** Chip label shown to the operator. */
    label: string;
    /** Text staged into the composer when the chip is selected. */
    prompt: string;
    /** Optional secondary description (aria text / tooltip). */
    description?: string;
}
/**
 * A registry is app-owned. `staticSuggestions` are the 3-4 curated entries
 * that always lead the row, in declared order. `derive` may return at most
 * one state-derived suggestion (empty account, quota pressure, …) that is
 * appended after the static entries.
 */
export interface ChatSuggestionRegistry<Context = unknown> {
    readonly staticSuggestions: readonly ChatSuggestion[];
    readonly derive?: ((context: Context) => ChatSuggestion | undefined) | undefined;
}
export interface CreateChatSuggestionRegistryInput<Context = unknown> {
    staticSuggestions: readonly ChatSuggestion[];
    derive?: ((context: Context) => ChatSuggestion | undefined) | undefined;
}
export type ChatSuggestionValidationReason = "invalid_suggestion" | "duplicate_id" | "invalid_derive";
export type CreateChatSuggestionRegistryResult<Context = unknown> = {
    ok: true;
    registry: ChatSuggestionRegistry<Context>;
} | {
    ok: false;
    reason: ChatSuggestionValidationReason;
};
export interface ResolveChatSuggestionsOptions<Context = unknown> {
    context?: Context;
    /** Maximum chips returned. Defaults to 5 (4 static + 1 derived). */
    limit?: number;
}
export declare const DEFAULT_SUGGESTION_LIMIT = 5;
/**
 * Structural validation for one suggestion. Returns a normalized frozen copy
 * with trimmed strings, or `undefined` when the entry must be dropped.
 */
export declare function normalizeChatSuggestion(value: unknown): ChatSuggestion | undefined;
/**
 * Validate and freeze a registry. Static entries are normalized and deduped
 * by `id`; a duplicate id or an entry that cannot be normalized fails closed
 * instead of silently dropping half of the curated row.
 */
export declare function createChatSuggestionRegistry<Context = unknown>(input: CreateChatSuggestionRegistryInput<Context>): CreateChatSuggestionRegistryResult<Context>;
/**
 * Resolve the chip row for one render: validated static entries in declared
 * order, then at most one derived entry appended last. A `derive` that throws
 * or returns an invalid shape contributes nothing; the static row still
 * renders. Duplicate ids keep the first occurrence.
 */
export declare function resolveChatSuggestions<Context = unknown>(registry: ChatSuggestionRegistry<Context>, options?: ResolveChatSuggestionsOptions<Context>): ChatSuggestion[];
/**
 * Minimal account snapshot the built-in derive understands. Applications may
 * pass richer snapshots; unknown fields are ignored here and remain available
 * to custom `derive` functions.
 */
export interface ChatAccountSnapshot {
    /** True when the tenant has not created its first resource yet. */
    isEmpty?: boolean;
    /** Plan/quota consumption in the range 0..1. */
    quotaUsedRatio?: number;
}
export interface AccountSnapshotDeriveOptions {
    /** Quota ratio at or above which the upgrade suggestion appears. Default 0.8. */
    quotaWarningThreshold?: number;
    /** Shown first when `snapshot.isEmpty` is true. */
    emptyAccountSuggestion?: ChatSuggestion;
    /** Shown when `quotaUsedRatio` reaches the threshold. Fixed or per-snapshot. */
    quotaWarningSuggestion?: ChatSuggestion | ((snapshot: ChatAccountSnapshot) => ChatSuggestion);
    /** Last-chance derive for any other account state. */
    fallback?: (snapshot: ChatAccountSnapshot) => ChatSuggestion | undefined;
}
/**
 * Factory for the canonical one-dynamic-suggestion derive: empty account wins,
 * then quota pressure, then the app fallback. Returns `undefined` when no
 * condition holds so the row stays purely static.
 */
export declare function createAccountSnapshotDerive(options: AccountSnapshotDeriveOptions): (snapshot: ChatAccountSnapshot) => ChatSuggestion | undefined;
//# sourceMappingURL=suggestions.d.ts.map