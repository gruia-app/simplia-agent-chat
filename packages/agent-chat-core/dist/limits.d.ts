/**
 * Limit-reached notices. The contract is provider-neutral: applications own the
 * quota decision and the action target; this module only validates the notice
 * shape so a malformed limit payload degrades to "no notice" instead of a
 * half-rendered upgrade prompt.
 */
export type ChatLimitKind = "quota_exceeded" | "plan_required" | "rate_limited" | "custom";
export interface ChatLimitNotice {
    /** Machine-readable reason. Quota systems key off this value. */
    kind: ChatLimitKind;
    /** Human-readable explanation rendered next to the composer. */
    message: string;
    /** CTA label (e.g. "Upgrade"). Omit for an informational notice. */
    actionLabel?: string;
    /** Stable action identifier handed back to `onLimitAction`. */
    actionId?: string;
    /**
     * When true (default) the host must block submitting while the notice is
     * shown. Compose/draft stays editable so the user does not lose text.
     */
    blocking?: boolean;
}
/**
 * Normalize untrusted host input into a `ChatLimitNotice`, or `undefined` when
 * the entry must be dropped. Missing/invalid `kind` or `message` fails closed.
 */
export declare function normalizeChatLimitNotice(value: unknown): ChatLimitNotice | undefined;
//# sourceMappingURL=limits.d.ts.map