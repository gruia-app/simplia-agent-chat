import type { ThreadRunPhase } from "simplia-agent-chat/core";

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
  readonly runPhaseLabel: (phase: ThreadRunPhase) => string;
  readonly interruptLabel: string;
  readonly interruptBusyLabel: string;
  readonly interruptRequestedLabel: string;
  readonly interruptError: string;
  readonly interruptDescription: string;
  readonly messageRendererFallback: string;
}

export type AgentChatCopyOverrides = Partial<AgentChatCopy>;

const defaultTurnAriaLabel = (status: string) => `Turn ${status}`;
const defaultItemAriaLabel = (label: string, status: string) => `${label}, ${status}`;
const identityStatus = (status: string) => status;
const identityDecision = (decision: string) => decision;
const defaultConfirmDecisionLabel = (decision: string) => `Confirm ${decision}`;
const defaultConfirmDecisionAriaLabel = (decision: string, title: string) =>
  `Confirm ${decision} for ${title}`;
const defaultBackAriaLabel = (title: string) => `Back to decisions for ${title}`;
const defaultRespondAriaLabel = (title: string) => `Respond to ${title}`;
const defaultAnswerLabel = (title: string) => `Answer for ${title}`;
const defaultSurfaceUnknownMessage = (kind: string, schemaVersion: number) =>
  `No trusted renderer is registered for ${kind} v${schemaVersion}.`;
const defaultSurfaceFallbackAriaLabel = (
  kind: string,
  schemaVersion: number,
  title: string | undefined,
) => {
  const trustedTitle = title?.trim();
  return trustedTitle ? `${trustedTitle} (${kind} v${schemaVersion})` : `${kind} v${schemaVersion}`;
};
const identityKind = (kind: string) => kind;
const RUN_PHASE_LABELS: Record<ThreadRunPhase, string> = {
  idle: "Idle",
  queued: "Queued",
  busy: "Busy",
  streaming: "Streaming",
  waiting: "Waiting",
  completed: "Completed",
  failed: "Failed",
  interrupted: "Interrupted",
  cancelled: "Cancelled",
};
const defaultRunPhaseLabel = (phase: ThreadRunPhase) => RUN_PHASE_LABELS[phase];

export const defaultAgentChatCopy: AgentChatCopy = Object.freeze({
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
  runPhaseLabel: defaultRunPhaseLabel,
  interruptLabel: "Stop",
  interruptBusyLabel: "Stopping…",
  interruptRequestedLabel: "Stop requested",
  interruptError: "The stop request could not be sent. Try again.",
  interruptDescription: "Requests that the provider stop the current turn.",
  messageRendererFallback: "This message could not be displayed.",
});

const resolvedCopies = new WeakSet<object>();
resolvedCopies.add(defaultAgentChatCopy);

const COPY_KEYS = Object.keys(defaultAgentChatCopy) as (keyof AgentChatCopy)[];

function wrapFormatter<T extends (this: void, ...args: never[]) => string>(fn: T, fallback: T): T {
  const wrapped = ((...args: never[]) => {
    try {
      const result = fn(...args);
      if (typeof result === "string" && result.length > 0) return result;
    } catch {
      // Application formatters must not leak payloads or exception text.
    }
    return fallback(...args);
  }) as T;
  return wrapped;
}

export function resolveAgentChatCopy(overrides?: AgentChatCopyOverrides): AgentChatCopy {
  if (overrides && resolvedCopies.has(overrides)) return overrides as AgentChatCopy;
  const resolved = { ...defaultAgentChatCopy };
  if (overrides) {
    for (const key of COPY_KEYS) {
      const override = overrides[key];
      if (override === undefined) continue;
      const fallback = defaultAgentChatCopy[key];
      if (typeof fallback === "function") {
        if (typeof override !== "function") continue;
        (resolved as Record<keyof AgentChatCopy, unknown>)[key] = wrapFormatter(
          override as typeof fallback,
          fallback,
        );
      } else if (typeof override === "string") {
        (resolved as Record<keyof AgentChatCopy, unknown>)[key] = override;
      }
    }
  }
  const frozen = Object.freeze(resolved);
  resolvedCopies.add(frozen);
  return frozen;
}

export function sacThemeAttributes(theme: AgentChatTheme | undefined): {
  "data-sac-theme": AgentChatTheme;
} | undefined {
  return theme ? { "data-sac-theme": theme } : undefined;
}
