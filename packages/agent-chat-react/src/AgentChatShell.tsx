"use client";

import { useMemo, type ReactNode } from "react";
import type {
  ChatState,
  ChatItem,
  JsonValue,
  PendingInteraction,
  SurfaceActionRef,
  SurfaceBlock,
} from "simplia-agent-chat/core";
import { ChatComposer, type ChatComposerProps } from "./ChatComposer.js";
import { ChatTimeline } from "./ChatTimeline.js";
import { PendingInteractions } from "./PendingInteractions.js";
import { ReactSurfaceRegistry } from "./surface-registry.js";
import { useFollowScroll } from "./use-follow-scroll.js";

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
}: AgentChatShellProps) {
  const interactions = useMemo(
    () => Object.values(state.interactions).filter((interaction) => interaction.threadId === threadId),
    [state.interactions, threadId],
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
    const surfaceRevisions = Object.values(state.surfaces)
      .filter((surface) => surface.threadId === threadId)
      .map((surface) => `${surface.id}.${surface.revision}`)
      .join("|");
    const lastEventId = state.seenEventIds.at(-1) ?? "initial";
    const pendingCount = interactions.filter((entry) => entry.status === "pending").length;
    return `${lastEventId}:${threadTurnIds.size}:${itemCount}:${surfaceRevisions}:${pendingCount}`;
  }, [interactions, state.items, state.seenEventIds, state.surfaces, state.turns, threadId]);
  const follow = useFollowScroll(contentVersion);

  return (
    <section className="sac-shell" aria-label={title}>
      <header className="sac-header">
        <div>
          <span className="sac-eyebrow">SHARED_AGENT_CHAT</span>
          <h2>{title}</h2>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        <div className="sac-toolbar">{toolbar}</div>
      </header>
      {contextRail ? <div className="sac-context-rail">{contextRail}</div> : null}
      <div className="sac-chat-stage">
        <div className="sac-scroll-region" ref={follow.containerRef} onScroll={follow.onScroll} tabIndex={0}>
          <ChatTimeline
            state={state}
            threadId={threadId}
            surfaceRegistry={surfaceRegistry}
            {...(emptyLabel ? { emptyLabel } : {})}
            {...(renderMessage ? { renderMessage } : {})}
            {...(onSurfaceAction ? { onSurfaceAction } : {})}
          />
        </div>
        {follow.mode === "free-scrolling" ? (
          <button className="sac-jump-button" type="button" onClick={() => follow.scrollToEnd("smooth")}>
            Return to live
          </button>
        ) : null}
      </div>
      <div className="sac-input-rail">
        <PendingInteractions interactions={interactions} onResolve={onResolveInteraction} />
        {composer ?? (
          <ChatComposer
            onSubmit={onSubmit}
            ariaLabel={composerAriaLabel}
            {...(composerPlaceholder ? { placeholder: composerPlaceholder } : {})}
            busy={busy}
          />
        )}
      </div>
    </section>
  );
}
