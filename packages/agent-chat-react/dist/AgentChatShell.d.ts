import { type ReactNode } from "react";
import { type ChatState, type ChatItem, type ChatLimitNotice, type ChatSuggestion, type ChatTurn, type JsonValue, type PendingInteraction, type SurfaceActionRef, type SurfaceBlock, type ThreadRunState } from "simplia-agent-chat/core";
import { type ChatComposerDraft, type ChatComposerProps } from "./ChatComposer.js";
import { type AgentChatCopy, type AgentChatCopyOverrides, type AgentChatTheme } from "./copy.js";
import { ReactSurfaceRegistry } from "./surface-registry.js";
export interface AgentChatSurfaceSlotProps {
    surfaces: SurfaceBlock[];
    surfaceRegistry: ReactSurfaceRegistry;
    onSurfaceAction?: ((block: SurfaceBlock, action: SurfaceActionRef, input?: JsonValue) => void) | undefined;
}
export interface AgentChatRunStatusSlotProps {
    runState: ThreadRunState;
    activeTurn: ChatTurn | undefined;
    copy: AgentChatCopy;
    onInterrupt?: ((turn: ChatTurn) => void | Promise<void>) | undefined;
}
export interface AgentChatShellProps {
    state: ChatState;
    threadId: string;
    surfaceRegistry: ReactSurfaceRegistry;
    title: string;
    subtitle?: string | undefined;
    onSubmit: ChatComposerProps["onSubmit"];
    onResolveInteraction: (interaction: PendingInteraction, resolution: JsonValue) => void | Promise<void>;
    onSurfaceAction?: ((block: SurfaceBlock, action: SurfaceActionRef, input?: JsonValue) => void) | undefined;
    composerAriaLabel: string;
    composerPlaceholder?: string | undefined;
    busy?: boolean | undefined;
    toolbar?: ReactNode | undefined;
    contextRail?: ReactNode | undefined;
    emptyLabel?: string | undefined;
    composer?: ReactNode | undefined;
    renderMessage?: ((item: ChatItem) => ReactNode) | undefined;
    artifactStageLabel?: string | undefined;
    renderArtifactStage?: ((props: AgentChatSurfaceSlotProps) => ReactNode) | undefined;
    renderFullscreenSurfaces?: ((props: AgentChatSurfaceSlotProps) => ReactNode) | undefined;
    copy?: AgentChatCopyOverrides | undefined;
    theme?: AgentChatTheme | undefined;
    headerLabel?: ReactNode | undefined;
    onInterrupt?: ((turn: ChatTurn) => void | Promise<void>) | undefined;
    composerActions?: ReactNode | undefined;
    renderRunStatus?: ((props: AgentChatRunStatusSlotProps) => ReactNode) | undefined;
    /** Chat-first home chips rendered above the composer. */
    suggestions?: readonly ChatSuggestion[] | undefined;
    /** Notified after a suggestion is staged into the composer draft. */
    onSuggestionSelect?: ((suggestion: ChatSuggestion) => void) | undefined;
    suggestionsAriaLabel?: string | undefined;
    /** Host-owned draft injection (e.g. voice transcripts). Wins over suggestion drafts. */
    composerDraft?: ChatComposerDraft | undefined;
    /**
     * Limit-reached notice rendered at the point of the limit, above the
     * composer. `blocking !== false` disables submitting while shown.
     */
    limitNotice?: ChatLimitNotice | undefined;
    /** Host action for the notice CTA (e.g. open billing/upgrade). */
    onLimitAction?: ((notice: ChatLimitNotice) => void) | undefined;
}
export declare function AgentChatShell({ state, threadId, surfaceRegistry, title, subtitle, onSubmit, onResolveInteraction, onSurfaceAction, composerAriaLabel, composerPlaceholder, busy, toolbar, contextRail, emptyLabel, composer, renderMessage, artifactStageLabel, renderArtifactStage, renderFullscreenSurfaces, copy, theme, headerLabel, onInterrupt, composerActions, renderRunStatus, suggestions, onSuggestionSelect, suggestionsAriaLabel, composerDraft, limitNotice, onLimitAction, }: AgentChatShellProps): import("react").JSX.Element;
//# sourceMappingURL=AgentChatShell.d.ts.map