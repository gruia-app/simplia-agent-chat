export type AgentChatTheme = "dark" | "light";
export interface AgentChatCopy {
    readonly jumpToLive: string;
    readonly artifactStageLabel: string;
    readonly emptyLabel: string;
    readonly conversationActivityLabel: string;
    readonly inspectDetails: string;
    readonly userLabel: string;
    readonly composerPlaceholder: string;
    readonly composerSubmitLabel: string;
    readonly composerHint: string;
    readonly composerBusyLabel: string;
    readonly pendingInteractionsLabel: string;
    readonly approvalRequiredLabel: string;
    readonly inputRequiredLabel: string;
    readonly confirmationRequiredHint: string;
    readonly confirmChoicePrefix: string;
    readonly backLabel: string;
    readonly submitAnswerLabel: string;
    readonly resolutionError: string;
    readonly surfaceUnavailableLabel: string;
    readonly surfaceInvalidMessage: string;
    readonly turnAriaLabel: (status: string) => string;
    readonly itemAriaLabel: (label: string, status: string) => string;
    readonly itemStatusLabel: (status: string) => string;
    readonly decisionLabel: (decision: string) => string;
    readonly confirmDecisionLabel: (decision: string) => string;
    readonly confirmDecisionAriaLabel: (decision: string, title: string) => string;
    readonly backAriaLabel: (title: string) => string;
    readonly respondAriaLabel: (title: string) => string;
    readonly answerLabel: (title: string) => string;
    readonly surfaceUnknownMessage: (kind: string, schemaVersion: number) => string;
    readonly surfaceFallbackAriaLabel: (kind: string, schemaVersion: number, title: string | undefined) => string;
    readonly surfaceStatusLabel: (status: string) => string;
    readonly surfaceKindLabel: (kind: string) => string;
}
export type AgentChatCopyOverrides = Partial<AgentChatCopy>;
export declare const defaultAgentChatCopy: AgentChatCopy;
export declare function resolveAgentChatCopy(overrides?: AgentChatCopyOverrides): AgentChatCopy;
export declare function sacThemeAttributes(theme: AgentChatTheme | undefined): {
    "data-sac-theme": AgentChatTheme;
} | undefined;
//# sourceMappingURL=copy.d.ts.map