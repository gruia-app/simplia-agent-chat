"use client";

import { useMemo, type ReactNode } from "react";
import {
  selectThreadTurns,
  selectTurnItems,
  type ChatItem,
  type ChatState,
  type JsonValue,
  type SurfaceActionRef,
  type SurfaceBlock,
} from "simplia-agent-chat/core";
import { ReactSurfaceRegistry, SurfaceHost } from "./surface-registry.js";

export interface ChatTimelineProps {
  state: ChatState;
  threadId: string;
  surfaceRegistry: ReactSurfaceRegistry;
  onSurfaceAction?: ((block: SurfaceBlock, action: SurfaceActionRef, input?: JsonValue) => void) | undefined;
  emptyLabel?: string | undefined;
  renderMessage?: ((item: ChatItem) => ReactNode) | undefined;
}

function stringifyDetail(value: JsonValue | undefined): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

function ItemRow({ item, renderMessage }: { item: ChatItem; renderMessage?: ((item: ChatItem) => ReactNode) | undefined }) {
  const text = item.text?.trim();
  const detail = stringifyDetail(item.output ?? item.input);
  const label = item.role === "user" ? "You" : item.title ?? item.toolName ?? item.kind;
  const messageLike = item.kind === "message" || item.kind === "reasoning" || item.kind === "system";

  return (
    <article className={`sac-item sac-item-${item.role ?? item.kind}`} aria-label={`${label}, ${item.status}`}>
      <div className="sac-item-meta">
        <span>{label}</span>
        <span className={`sac-status sac-status-${item.status}`}>{item.status}</span>
      </div>
      {text ? (
        <div className={messageLike ? "sac-message-text" : "sac-work-title"}>
          {messageLike && renderMessage ? renderMessage(item) : text}
        </div>
      ) : null}
      {!messageLike && detail ? (
        <details className="sac-work-detail">
          <summary>Inspect details</summary>
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
  emptyLabel = "No messages yet. Send a precise instruction to begin.",
  renderMessage,
}: ChatTimelineProps) {
  const turns = useMemo(() => selectThreadTurns(state, threadId), [state, threadId]);
  const surfacesByTurn = useMemo(() => {
    const next = new Map<string, SurfaceBlock[]>();
    for (const surface of Object.values(state.surfaces)) {
      if (surface.threadId !== threadId) continue;
      const key = surface.turnId ?? "thread";
      next.set(key, [...(next.get(key) ?? []), surface]);
    }
    return next;
  }, [state.surfaces, threadId]);

  if (turns.length === 0 && (surfacesByTurn.get("thread")?.length ?? 0) === 0) {
    return <div className="sac-empty">{emptyLabel}</div>;
  }

  return (
    <div
      className="sac-timeline"
      role="log"
      aria-live="off"
      aria-relevant="additions text"
      aria-atomic="false"
      aria-label="Conversation activity"
    >
      {(surfacesByTurn.get("thread") ?? []).map((surface) => (
        <SurfaceHost
          key={surface.id}
          block={surface}
          registry={surfaceRegistry}
          {...(onSurfaceAction ? { onAction: onSurfaceAction } : {})}
        />
      ))}
      {turns.map((turn) => (
        <section className="sac-turn" key={turn.id} aria-label={`Turn ${turn.status}`}>
          {selectTurnItems(state, turn.id).map((item) => (
            <ItemRow item={item} key={item.id} {...(renderMessage ? { renderMessage } : {})} />
          ))}
          {(surfacesByTurn.get(turn.id) ?? []).map((surface) => (
            <SurfaceHost
              key={surface.id}
              block={surface}
              registry={surfaceRegistry}
              {...(onSurfaceAction ? { onAction: onSurfaceAction } : {})}
            />
          ))}
        </section>
      ))}
    </div>
  );
}
