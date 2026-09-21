import type { ChatItem, ChatTurn } from "./protocol.js";
import { type ChatState } from "./state.js";
export declare const DEFAULT_TIMELINE_PAGE_LIMIT = 50;
export declare const MAX_TIMELINE_PAGE_LIMIT = 500;
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
export type TimelinePageResult = {
    ok: true;
    page: TimelinePage;
} | {
    ok: false;
    reason: "invalid_cursor";
};
/** Build an opaque cursor bound to a turn id. Hosts normally use `nextCursor`. */
export declare function createTimelineCursor(turnId: string): string;
/**
 * Select a bounded page of a thread timeline for virtualized or paged
 * rendering. Without a cursor, returns the newest `limit` turns — the window
 * a chat view renders first. `nextCursor` pages towards older turns.
 *
 * Ordering matches `selectThreadTurns` (startedAt, then id), so pages are
 * deterministic under replay. Cursors reference turn ids, not offsets, so
 * they stay valid while new turns append at the tail.
 */
export declare function selectTimelinePage(state: ChatState, threadId: string, options?: TimelinePageOptions): TimelinePageResult;
//# sourceMappingURL=timeline.d.ts.map