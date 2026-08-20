"use client";

import { useId, useMemo, type ReactNode } from "react";
import {
  selectThreadSurfaces,
  type ChatState,
  type ChatItem,
  type JsonValue,
  type PendingInteraction,
  type SurfaceActionRef,
  type SurfaceBlock,
} from "simplia-agent-chat/core";
import { ChatComposer, type ChatComposerProps } from "./ChatComposer.js";
import { ChatTimeline } from "./ChatTimeline.js";
import {
  resolveAgentChatCopy,
  sacThemeAttributes,
  type AgentChatCopy,
  type AgentChatCopyOverrides,
  type AgentChatTheme,
} from "./copy.js";
import { PendingInteractions } from "./PendingInteractions.js";
import { ReactSurfaceRegistry, SurfaceHost } from "./surface-registry.js";
import { useFollowScroll } from "./use-follow-scroll.js";

export interface AgentChatSurfaceSlotProps {
  surfaces: SurfaceBlock[];
  surfaceRegistry: ReactSurfaceRegistry;
  onSurfaceAction?: ((block: SurfaceBlock, action: SurfaceActionRef, input?: JsonValue) => void) | undefined;
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
}: AgentChatShellProps) {
  const resolvedCopy = useMemo(() => resolveAgentChatCopy(copy), [copy]);
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
        <PendingInteractions
          interactions={interactions}
          onResolve={onResolveInteraction}
          copy={resolvedCopy}
        />
        {composer ?? (
          <ChatComposer
            onSubmit={onSubmit}
            ariaLabel={composerAriaLabel}
            copy={resolvedCopy}
            busy={busy}
            {...(composerPlaceholder !== undefined ? { placeholder: composerPlaceholder } : {})}
          />
        )}
      </div>
    </section>
  );
}
