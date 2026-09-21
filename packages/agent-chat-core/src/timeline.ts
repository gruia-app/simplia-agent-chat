import type { ChatItem, ChatTurn } from "./protocol.js";
import { selectThreadTurns, selectTurnItems, type ChatState } from "./state.js";

export const DEFAULT_TIMELINE_PAGE_LIMIT = 50;
export const MAX_TIMELINE_PAGE_LIMIT = 500;

const CURSOR_PREFIX = "turn:";

/** A turn and its resolved items, in canonical timeline order. */
export interface TimelineEntry {
  turn: ChatTurn;
  items: ChatItem[];
}

/**
 * One page of a thread timeline. Pages are chronological within themselves;
 * callers page backwards (towards older turns) by passing `nextCursor` into
 * the following `selectTimelinePage` call.
 */
export interface TimelinePage {
  threadId: string;
  entries: TimelineEntry[];
  /** Older turns remain beyond this page. */
  hasMore: boolean;
  /** Opaque cursor for the next older page. Present only when `hasMore`. */
  nextCursor?: string;
  totalTurns: number;
}

export interface TimelinePageOptions {
  /** Max turns per page. Defaults to 50, clamped to [1, 500]. */
  limit?: number;
  /** Opaque cursor from a previous page's `nextCursor`. */
  cursor?: string;
}

export type TimelinePageResult =
  | { ok: true; page: TimelinePage }
  | { ok: false; reason: "invalid_cursor" };

/** Build an opaque cursor bound to a turn id. Hosts normally use `nextCursor`. */
export function createTimelineCursor(turnId: string): string {
  return `${CURSOR_PREFIX}${turnId}`;
}

function readTimelineCursor(cursor: string): string | undefined {
  if (!cursor.startsWith(CURSOR_PREFIX)) return undefined;
  const turnId = cursor.slice(CURSOR_PREFIX.length).trim();
  return turnId ? turnId : undefined;
}

function normalizePageLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) return DEFAULT_TIMELINE_PAGE_LIMIT;
  const rounded = Math.floor(limit);
  if (rounded < 1) return DEFAULT_TIMELINE_PAGE_LIMIT;
  return Math.min(rounded, MAX_TIMELINE_PAGE_LIMIT);
}

/**
 * Select a bounded page of a thread timeline for virtualized or paged
 * rendering. Without a cursor, returns the newest `limit` turns — the window
 * a chat view renders first. `nextCursor` pages towards older turns.
 *
 * Ordering matches `selectThreadTurns` (startedAt, then id), so pages are
 * deterministic under replay. Cursors reference turn ids, not offsets, so
 * they stay valid while new turns append at the tail.
 */
export function selectTimelinePage(
  state: ChatState,
  threadId: string,
  options: TimelinePageOptions = {},
): TimelinePageResult {
  const turns = selectThreadTurns(state, threadId);

  let end = turns.length;
  if (options.cursor !== undefined) {
    const cursorTurnId = readTimelineCursor(options.cursor);
    const cursorIndex = cursorTurnId
      ? turns.findIndex((turn) => turn.id === cursorTurnId)
      : -1;
    if (cursorIndex < 0) return { ok: false, reason: "invalid_cursor" };
    end = cursorIndex;
  }

  const limit = normalizePageLimit(options.limit);
  const start = Math.max(0, end - limit);
  const pageTurns = turns.slice(start, end);
  const hasMore = start > 0;
  const first = pageTurns[0];

  return {
    ok: true,
    page: {
      threadId,
      entries: pageTurns.map((turn) => ({ turn, items: selectTurnItems(state, turn.id) })),
      hasMore,
      ...(hasMore && first ? { nextCursor: createTimelineCursor(first.id) } : {}),
      totalTurns: turns.length,
    },
  };
}
