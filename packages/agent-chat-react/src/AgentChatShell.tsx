"use client";

import { useId, useMemo, useRef, useState, type ReactNode } from "react";
import {
  selectActiveTurn,
  selectThreadRunState,
  selectThreadSurfaces,
  type ChatState,
  type ChatItem,
  type ChatLimitNotice,
  type ChatSuggestion,
  type ChatTurn,
  type JsonValue,
  type PendingInteraction,
  type SurfaceActionRef,
  type SurfaceBlock,
  type ThreadRunState,
} from "simplia-agent-chat/core";
import { ChatComposer, type ChatComposerDraft, type ChatComposerProps } from "./ChatComposer.js";
import { ChatRunStatus } from "./ChatRunStatus.js";
import { LimitNoticeBar } from "./LimitNotice.js";
import { ChatTimeline } from "./ChatTimeline.js";
import {
  resolveAgentChatCopy,
  sacThemeAttributes,
  type AgentChatCopy,
  type AgentChatCopyOverrides,
  type AgentChatTheme,
} from "./copy.js";
import { PendingInteractions } from "./PendingInteractions.js";
import { SuggestionChips } from "./SuggestionChips.js";
import { ReactSurfaceRegistry, SurfaceHost } from "./surface-registry.js";
import { useFollowScroll } from "./use-follow-scroll.js";

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

function surfaceSlotProps(
  surfaces: SurfaceBlock[],
  surfaceRegistry: ReactSurfaceRegistry,
  onSurfaceAction: AgentChatShellProps["onSurfaceAction"],
): AgentChatSurfaceSlotProps {
  return {
    surfaces,
    surfaceRegistry,
    ...(onSurfaceAction ? { onSurfaceAction } : {}),
  };
}

function DefaultArtifactStage({
  surfaces,
  surfaceRegistry,
  onSurfaceAction,
  label,
  copy,
}: AgentChatSurfaceSlotProps & {
  label: string;
  copy: AgentChatCopy;
}) {
  const headingId = useId();
  return (
    <aside className="sac-artifact-stage" aria-labelledby={headingId}>
      <div className="sac-artifact-stage-header">
        <h3 id={headingId}>{label}</h3>
      </div>
      <div className="sac-artifact-stage-scroll">
        {surfaces.map((surface) => (
          <SurfaceHost
            key={surface.id}
            block={surface}
            registry={surfaceRegistry}
            copy={copy}
            {...(onSurfaceAction ? { onAction: onSurfaceAction } : {})}
          />
        ))}
      </div>
    </aside>
  );
}

export function AgentChatShell({
  state,
  threadId,
  surfaceRegistry,
  title,
  subtitle,
  onSubmit,
  onResolveInteraction,
  onSurfaceAction,
  composerAriaLabel,
  composerPlaceholder,
  busy = false,
  toolbar,
  contextRail,
  emptyLabel,
  composer,
  renderMessage,
  artifactStageLabel,
  renderArtifactStage,
  renderFullscreenSurfaces,
  copy,
  theme,
  headerLabel,
  onInterrupt,
  composerActions,
  renderRunStatus,
  suggestions,
  onSuggestionSelect,
  suggestionsAriaLabel,
  composerDraft,
  limitNotice,
  onLimitAction,
}: AgentChatShellProps) {
  const resolvedCopy = useMemo(() => resolveAgentChatCopy(copy), [copy]);
  const protocolRunState = useMemo(() => selectThreadRunState(state, threadId), [state, threadId]);
  const runState = useMemo<ThreadRunState>(() => (
    busy && (protocolRunState.phase === "idle" || protocolRunState.phase === "completed")
      ? { phase: "busy" }
      : protocolRunState
  ), [busy, protocolRunState]);
  const activeTurn = useMemo(() => selectActiveTurn(state, threadId), [state, threadId]);
  const stageLabel = artifactStageLabel ?? resolvedCopy.artifactStageLabel;
  const interactions = useMemo(
    () => Object.values(state.interactions).filter((interaction) => interaction.threadId === threadId),
    [state.interactions, threadId],
  );
  const panelSurfaces = useMemo(
    () => selectThreadSurfaces(state, threadId, "panel"),
    [state, threadId],
  );
  const fullscreenSurfaces = useMemo(
    () => selectThreadSurfaces(state, threadId, "fullscreen"),
    [state, threadId],
  );
  const contentVersion = useMemo(() => {
    const threadTurnIds = new Set(
      Object.values(state.turns)
        .filter((turn) => turn.threadId === threadId)
        .map((turn) => turn.id),
    );
    const itemCount = Object.values(state.items)
      .filter((item) => item.threadId === threadId && threadTurnIds.has(item.turnId))
      .length;
    const surfaceRevisions = selectThreadSurfaces(state, threadId, "inline")
      .map((surface) => `${surface.id}.${surface.revision}`)
      .join("|");
    const lastEventId = state.seenEventIds.at(-1) ?? "initial";
    const pendingCount = interactions.filter((entry) => entry.status === "pending").length;
    return `${lastEventId}:${threadTurnIds.size}:${itemCount}:${surfaceRevisions}:${pendingCount}`;
  }, [interactions, state.items, state.seenEventIds, state.surfaces, state.turns, threadId]);
  const follow = useFollowScroll(contentVersion);
  const slotProps = surfaceSlotProps(panelSurfaces, surfaceRegistry, onSurfaceAction);
  const hasArtifactStage = panelSurfaces.length > 0;
  const runStatusSlotProps: AgentChatRunStatusSlotProps = {
    runState,
    activeTurn,
    copy: resolvedCopy,
    ...(onInterrupt ? { onInterrupt } : {}),
  };
  const runStatus = renderRunStatus
    ? renderRunStatus(runStatusSlotProps)
    : runState.phase !== "idle"
      ? (
        <ChatRunStatus
          runState={runState}
          copy={resolvedCopy}
          {...(onInterrupt ? { onInterrupt } : {})}
          {...(theme ? { theme } : {})}
        />
      )
      : null;

  const draftRevisionRef = useRef(0);
  const [suggestionDraft, setSuggestionDraft] = useState<ChatComposerDraft | undefined>(undefined);
  const effectiveDraft = composerDraft ?? suggestionDraft;
  const onSuggestion = (suggestion: ChatSuggestion) => {
    if (composerDraft === undefined) {
      draftRevisionRef.current += 1;
      setSuggestionDraft({ value: suggestion.prompt, revision: draftRevisionRef.current });
    }
    onSuggestionSelect?.(suggestion);
  };

  const chatStage = (
    <div className="sac-chat-stage">
      <div className="sac-scroll-region" ref={follow.containerRef} onScroll={follow.onScroll} tabIndex={0}>
        <ChatTimeline
          state={state}
          threadId={threadId}
          surfaceRegistry={surfaceRegistry}
          copy={resolvedCopy}
          {...(emptyLabel !== undefined ? { emptyLabel } : {})}
          {...(renderMessage ? { renderMessage } : {})}
          {...(onSurfaceAction ? { onSurfaceAction } : {})}
        />
      </div>
      {follow.mode === "free-scrolling" ? (
        <button className="sac-jump-button" type="button" onClick={() => follow.scrollToEnd("smooth")}>
          {resolvedCopy.jumpToLive}
        </button>
      ) : null}
    </div>
  );

  return (
    <section className="sac-shell" aria-label={title} {...sacThemeAttributes(theme)}>
      <header className="sac-header">
        <div>
          {headerLabel ? <div className="sac-header-label">{headerLabel}</div> : null}
          <h2>{title}</h2>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        <div className="sac-toolbar">{toolbar}</div>
      </header>
      {contextRail ? <div className="sac-context-rail">{contextRail}</div> : null}
      {hasArtifactStage ? (
        <div className="sac-workspace-with-stage">
          {chatStage}
          <div className="sac-artifact-column">
            {renderArtifactStage
              ? renderArtifactStage(slotProps)
              : (
                <DefaultArtifactStage
                  {...slotProps}
                  label={stageLabel}
                  copy={resolvedCopy}
                />
              )}
          </div>
        </div>
      ) : (
        chatStage
      )}
      {renderFullscreenSurfaces && fullscreenSurfaces.length > 0
        ? renderFullscreenSurfaces(surfaceSlotProps(fullscreenSurfaces, surfaceRegistry, onSurfaceAction))
        : null}
      <div className="sac-input-rail">
        {runStatus}
        <PendingInteractions
          interactions={interactions}
          onResolve={onResolveInteraction}
          copy={resolvedCopy}
        />
        {suggestions && suggestions.length > 0 ? (
          <SuggestionChips
            suggestions={suggestions}
            onSelect={onSuggestion}
            ariaLabel={suggestionsAriaLabel ?? resolvedCopy.suggestionsLabel}
            {...(theme ? { theme } : {})}
          />
        ) : null}
        {limitNotice ? (
          <LimitNoticeBar
            notice={limitNotice}
            onAction={onLimitAction}
            ariaLabel={resolvedCopy.limitNoticeLabel}
            {...(theme ? { theme } : {})}
          />
        ) : null}
        {composer ?? (
          <ChatComposer
            onSubmit={onSubmit}
            ariaLabel={composerAriaLabel}
            copy={resolvedCopy}
            busy={busy}
            disabled={limitNotice !== undefined && limitNotice.blocking !== false}
            {...(composerPlaceholder !== undefined ? { placeholder: composerPlaceholder } : {})}
            {...(composerActions !== undefined ? { actions: composerActions } : {})}
            {...(effectiveDraft !== undefined ? { draft: effectiveDraft } : {})}
          />
        )}
      </div>
    </section>
  );
}
