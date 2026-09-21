import { selectThreadTurns, selectTurnItems } from "./state.js";
export const DEFAULT_TIMELINE_PAGE_LIMIT = 50;
export const MAX_TIMELINE_PAGE_LIMIT = 500;
const CURSOR_PREFIX = "turn:";
/** Build an opaque cursor bound to a turn id. Hosts normally use `nextCursor`. */
export function createTimelineCursor(turnId) {
    return `${CURSOR_PREFIX}${turnId}`;
}
function readTimelineCursor(cursor) {
    if (!cursor.startsWith(CURSOR_PREFIX))
        return undefined;
    const turnId = cursor.slice(CURSOR_PREFIX.length).trim();
    return turnId ? turnId : undefined;
}
function normalizePageLimit(limit) {
    if (limit === undefined || !Number.isFinite(limit))
        return DEFAULT_TIMELINE_PAGE_LIMIT;
    const rounded = Math.floor(limit);
    if (rounded < 1)
        return DEFAULT_TIMELINE_PAGE_LIMIT;
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
export function selectTimelinePage(state, threadId, options = {}) {
    const turns = selectThreadTurns(state, threadId);
    let end = turns.length;
    if (options.cursor !== undefined) {
        const cursorTurnId = readTimelineCursor(options.cursor);
        const cursorIndex = cursorTurnId
            ? turns.findIndex((turn) => turn.id === cursorTurnId)
            : -1;
        if (cursorIndex < 0)
            return { ok: false, reason: "invalid_cursor" };
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
//# sourceMappingURL=timeline.js.map