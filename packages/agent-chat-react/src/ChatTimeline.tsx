"use client";

import { useMemo, type ReactNode } from "react";
import {
  selectThreadSurfaces,
  selectThreadTurns,
  selectTurnItems,
  type ChatItem,
  type ChatState,
  type JsonValue,
  type SurfaceActionRef,
  type SurfaceBlock,
} from "simplia-agent-chat/core";
import {
  resolveAgentChatCopy,
  sacThemeAttributes,
  type AgentChatCopy,
  type AgentChatCopyOverrides,
  type AgentChatTheme,
} from "./copy.js";
import { ReactSurfaceRegistry, SurfaceHost } from "./surface-registry.js";

export interface ChatTimelineProps {
  state: ChatState;
  threadId: string;
  surfaceRegistry: ReactSurfaceRegistry;
  onSurfaceAction?: ((block: SurfaceBlock, action: SurfaceActionRef, input?: JsonValue) => void) | undefined;
  emptyLabel?: string | undefined;
  renderMessage?: ((item: ChatItem) => ReactNode) | undefined;
  copy?: AgentChatCopyOverrides | undefined;
  theme?: AgentChatTheme | undefined;
}

function stringifyDetail(value: JsonValue | undefined): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

function ItemRow({
  item,
  renderMessage,
  copy,
}: {
  item: ChatItem;
  renderMessage?: ((item: ChatItem) => ReactNode) | undefined;
  copy: AgentChatCopy;
}) {
  const text = item.text?.trim();
  const detail = stringifyDetail(item.output ?? item.input);
  const label = item.role === "user" ? copy.userLabel : item.title ?? item.toolName ?? item.kind;
  const statusLabel = copy.itemStatusLabel(item.status);
  const messageLike = item.kind === "message" || item.kind === "reasoning" || item.kind === "system";

  return (
    <article className={`sac-item sac-item-${item.role ?? item.kind}`} aria-label={copy.itemAriaLabel(label, item.status)}>
      <div className="sac-item-meta">
        <span>{label}</span>
        <span className={`sac-status sac-status-${item.status}`}>{statusLabel}</span>
      </div>
      {text ? (
        <div className={messageLike ? "sac-message-text" : "sac-work-title"}>
          {messageLike && renderMessage ? renderMessage(item) : text}
        </div>
      ) : null}
      {!messageLike && detail ? (
        <details className="sac-work-detail">
          <summary>{copy.inspectDetails}</summary>
          <pre>{detail}</pre>
        </details>
      ) : null}
    </article>
  );
}

export function ChatTimeline({
  state,
  threadId,
  surfaceRegistry,
  onSurfaceAction,
  emptyLabel,
  renderMessage,
  copy,
  theme,
}: ChatTimelineProps) {
  const resolved = resolveAgentChatCopy(copy);
  const emptyText = emptyLabel ?? resolved.emptyLabel;
  const turns = useMemo(() => selectThreadTurns(state, threadId), [state, threadId]);
  const surfacesByTurn = useMemo(() => {
    const next = new Map<string, SurfaceBlock[]>();
    for (const surface of selectThreadSurfaces(state, threadId, "inline")) {
      const key = surface.turnId ?? "thread";
      next.set(key, [...(next.get(key) ?? []), surface]);
    }
    return next;
  }, [state, threadId]);

  if (turns.length === 0 && (surfacesByTurn.get("thread")?.length ?? 0) === 0) {
    return (
      <div className="sac-empty sac-theme" {...sacThemeAttributes(theme)}>
        {emptyText}
      </div>
    );
  }

  return (
    <div
      className="sac-timeline sac-theme"
      role="log"
      aria-live="off"
      aria-relevant="additions text"
      aria-atomic="false"
      aria-label={resolved.conversationActivityLabel}
      {...sacThemeAttributes(theme)}
    >
      {(surfacesByTurn.get("thread") ?? []).map((surface) => (
        <SurfaceHost
          key={surface.id}
          block={surface}
          registry={surfaceRegistry}
          copy={resolved}
          {...(theme ? { theme } : {})}
          {...(onSurfaceAction ? { onAction: onSurfaceAction } : {})}
        />
      ))}
      {turns.map((turn) => (
        <section className="sac-turn" key={turn.id} aria-label={resolved.turnAriaLabel(turn.status)}>
          {selectTurnItems(state, turn.id).map((item) => (
            <ItemRow item={item} key={item.id} copy={resolved} {...(renderMessage ? { renderMessage } : {})} />
          ))}
          {(surfacesByTurn.get(turn.id) ?? []).map((surface) => (
            <SurfaceHost
              key={surface.id}
              block={surface}
              registry={surfaceRegistry}
              copy={resolved}
              {...(theme ? { theme } : {})}
              {...(onSurfaceAction ? { onAction: onSurfaceAction } : {})}
            />
          ))}
        </section>
      ))}
    </div>
  );
}
