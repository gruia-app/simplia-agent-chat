const defaultTurnAriaLabel = (status) => `Turn ${status}`;
const defaultItemAriaLabel = (label, status) => `${label}, ${status}`;
const identityStatus = (status) => status;
const identityDecision = (decision) => decision;
const defaultConfirmDecisionLabel = (decision) => `Confirm ${decision}`;
const defaultConfirmDecisionAriaLabel = (decision, title) => `Confirm ${decision} for ${title}`;
const defaultBackAriaLabel = (title) => `Back to decisions for ${title}`;
const defaultRespondAriaLabel = (title) => `Respond to ${title}`;
const defaultAnswerLabel = (title) => `Answer for ${title}`;
const defaultSurfaceUnknownMessage = (kind, schemaVersion) => `No trusted renderer is registered for ${kind} v${schemaVersion}.`;
const defaultSurfaceFallbackAriaLabel = (kind, schemaVersion, title) => {
    const trustedTitle = title?.trim();
    return trustedTitle ? `${trustedTitle} (${kind} v${schemaVersion})` : `${kind} v${schemaVersion}`;
};
const identityKind = (kind) => kind;
export const defaultAgentChatCopy = Object.freeze({
    jumpToLive: "Return to live",
    artifactStageLabel: "Artifacts",
    emptyLabel: "No messages yet. Send a precise instruction to begin.",
    conversationActivityLabel: "Conversation activity",
    inspectDetails: "Inspect details",
    userLabel: "You",
    composerPlaceholder: "Describe the next action…",
    composerSubmitLabel: "Send",
    composerHint: "Enter to send · Shift+Enter for a new line",
    composerBusyLabel: "Working…",
    pendingInteractionsLabel: "Pending agent interactions",
    approvalRequiredLabel: "APPROVAL_REQUIRED",
    inputRequiredLabel: "INPUT_REQUIRED",
    confirmationRequiredHint: "Selecting a decision requires Confirm before it is submitted.",
    confirmChoicePrefix: "Confirm decision:",
    backLabel: "Back",
    submitAnswerLabel: "Submit",
    resolutionError: "The response could not be submitted. Try again.",
    surfaceUnavailableLabel: "SURFACE_UNAVAILABLE",
    surfaceInvalidMessage: "This surface payload did not pass its local schema.",
    turnAriaLabel: defaultTurnAriaLabel,
    itemAriaLabel: defaultItemAriaLabel,
    itemStatusLabel: identityStatus,
    decisionLabel: identityDecision,
    confirmDecisionLabel: defaultConfirmDecisionLabel,
    confirmDecisionAriaLabel: defaultConfirmDecisionAriaLabel,
    backAriaLabel: defaultBackAriaLabel,
    respondAriaLabel: defaultRespondAriaLabel,
    answerLabel: defaultAnswerLabel,
    surfaceUnknownMessage: defaultSurfaceUnknownMessage,
    surfaceFallbackAriaLabel: defaultSurfaceFallbackAriaLabel,
    surfaceStatusLabel: identityStatus,
    surfaceKindLabel: identityKind,
});
const resolvedCopies = new WeakSet();
resolvedCopies.add(defaultAgentChatCopy);
const COPY_KEYS = Object.keys(defaultAgentChatCopy);
function wrapFormatter(fn, fallback) {
    const wrapped = ((...args) => {
        try {
            const result = fn(...args);
            if (typeof result === "string" && result.length > 0)
                return result;
        }
        catch {
            // Application formatters must not leak payloads or exception text.
        }
        return fallback(...args);
    });
    return wrapped;
}
export function resolveAgentChatCopy(overrides) {
    if (overrides && resolvedCopies.has(overrides))
        return overrides;
    const resolved = { ...defaultAgentChatCopy };
    if (overrides) {
        for (const key of COPY_KEYS) {
            const override = overrides[key];
            if (override === undefined)
                continue;
            const fallback = defaultAgentChatCopy[key];
            if (typeof fallback === "function") {
                if (typeof override !== "function")
                    continue;
                resolved[key] = wrapFormatter(override, fallback);
            }
            else if (typeof override === "string") {
                resolved[key] = override;
            }
        }
    }
    const frozen = Object.freeze(resolved);
    resolvedCopies.add(frozen);
    return frozen;
}
export function sacThemeAttributes(theme) {
    return theme ? { "data-sac-theme": theme } : undefined;
}
//# sourceMappingURL=copy.js.map