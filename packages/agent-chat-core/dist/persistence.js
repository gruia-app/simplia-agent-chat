import { CHAT_PROTOCOL_VERSION, validateChatEvent, } from "./protocol.js";
import { createChatRuntime } from "./runtime.js";
import { createInitialChatState, reduceChatEvent, } from "./state.js";
const commitTails = new WeakMap();
function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}
function isFinitePositiveInteger(value) {
    return typeof value === "number" && Number.isInteger(value) && Number.isFinite(value) && value > 0;
}
function isNonEmptyString(value) {
    return typeof value === "string" && value.trim().length > 0;
}
function isAborted(signal) {
    return signal?.aborted === true;
}
function abortResult() {
    return { ok: false, persisted: false, reason: "aborted" };
}
function hydrateAbort() {
    return { ok: false, reason: "aborted" };
}
function isAbortError(error) {
    return error instanceof Error && error.name === "AbortError";
}
function throwIfAborted(signal) {
    if (!isAborted(signal))
        return;
    const error = new Error("The operation was aborted");
    error.name = "AbortError";
    throw error;
}
function copyResyncRequests(requests) {
    return Object.fromEntries(Object.entries(requests).map(([streamId, request]) => [streamId, { ...request }]));
}
function enqueueCommit(runtime, work) {
    const previous = commitTails.get(runtime) ?? Promise.resolve();
    const current = previous.then(work, work);
    commitTails.set(runtime, current.then(() => undefined, () => undefined));
    return current;
}
function belongsToRequestedStream(event, streamId) {
    if (streamId === undefined || event.stream === undefined)
        return true;
    return event.stream.id === streamId;
}
function belongsToRequestedThread(event, threadId) {
    return event.threadId === threadId;
}
function snapshotMatchesQuery(event, query) {
    if (event.threadId !== query.threadId)
        return false;
    if (query.streamId !== undefined && event.stream !== undefined && event.stream.id !== query.streamId) {
        return false;
    }
    return true;
}
function asJournalPage(value) {
    if (!isPlainObject(value))
        return undefined;
    if (!Array.isArray(value.events) || typeof value.done !== "boolean")
        return undefined;
    if (value.nextCursor !== undefined && !isNonEmptyString(value.nextCursor))
        return undefined;
    const page = {
        events: value.events,
        done: value.done,
    };
    if (isNonEmptyString(value.nextCursor))
        page.nextCursor = value.nextCursor;
    return page;
}
function journalQuery(query, cursor, after) {
    const next = {
        threadId: query.threadId,
        limit: query.limit,
    };
    if (query.streamId !== undefined)
        next.streamId = query.streamId;
    if (cursor !== undefined)
        next.cursor = cursor;
    if (after !== undefined)
        next.after = after;
    if (query.signal !== undefined)
        next.signal = query.signal;
    return next;
}
/**
 * Validate, append, then apply, in that order. Concurrent calls on the same
 * runtime run in call order. A successful append is not rolled back if the
 * reducer reports a duplicate, gap, or conflict.
 */
export async function commitChatEvent(runtime, persistence, event, options) {
    if (isAborted(options?.signal))
        return abortResult();
    return enqueueCommit(runtime, async () => {
        if (isAborted(options?.signal))
            return abortResult();
        const validated = validateChatEvent(event);
        if (!validated.ok) {
            return { ok: false, persisted: false, reason: validated.reason };
        }
        if (isAborted(options?.signal))
            return abortResult();
        try {
            await persistence.append(validated.event, options);
        }
        catch (error) {
            if (isAborted(options?.signal) || isAbortError(error))
                return abortResult();
            return error !== undefined
                ? { ok: false, persisted: false, reason: "append_failed", error }
                : { ok: false, persisted: false, reason: "append_failed" };
        }
        const result = runtime.apply(validated.event);
        return { ok: true, persisted: true, result };
    });
}
/**
 * Build a new runtime from an optional `thread.snapshot` plus bounded opaque
 * journal pages. Notifications do not run during hydration. Envelope poison
 * fails closed; reducer duplicate/stale/gap/conflict results continue so a
 * later high-water snapshot can recover.
 */
export async function hydrateChatRuntime(persistence, query) {
    if (!isNonEmptyString(query.threadId) || !isFinitePositiveInteger(query.limit)) {
        return { ok: false, reason: "invalid_query" };
    }
    if (query.streamId !== undefined && !isNonEmptyString(query.streamId)) {
        return { ok: false, reason: "invalid_query" };
    }
    if (isAborted(query.signal))
        return hydrateAbort();
    let state = createInitialChatState();
    let after;
    try {
        const snapshotQuery = { threadId: query.threadId };
        if (query.streamId !== undefined)
            snapshotQuery.streamId = query.streamId;
        if (query.signal !== undefined)
            snapshotQuery.signal = query.signal;
        const rawSnapshot = await persistence.loadSnapshot(snapshotQuery);
        if (isAborted(query.signal))
            return hydrateAbort();
        if (rawSnapshot !== undefined && rawSnapshot !== null) {
            const validated = validateChatEvent(rawSnapshot);
            if (!validated.ok)
                return { ok: false, reason: validated.reason };
            if (validated.event.type !== "thread.snapshot") {
                return { ok: false, reason: "invalid_snapshot" };
            }
            if (!snapshotMatchesQuery(validated.event, query)) {
                return { ok: false, reason: "foreign_snapshot" };
            }
            state = reduceChatEvent(state, validated.event).state;
            if (validated.event.stream) {
                after = {
                    streamId: validated.event.stream.id,
                    sequence: validated.event.stream.sequence,
                };
            }
        }
        let cursor;
        const seenCursors = new Set();
        for (;;) {
            if (isAborted(query.signal))
                return hydrateAbort();
            const pageValue = await persistence.readJournal(journalQuery(query, cursor, after));
            if (isAborted(query.signal))
                return hydrateAbort();
            const page = asJournalPage(pageValue);
            if (!page)
                return { ok: false, reason: "invalid_page" };
            if (!page.done) {
                if (page.events.length === 0)
                    return { ok: false, reason: "invalid_page" };
                if (page.nextCursor === undefined)
                    return { ok: false, reason: "invalid_page" };
                if (page.nextCursor === cursor || seenCursors.has(page.nextCursor)) {
                    return { ok: false, reason: "invalid_page" };
                }
            }
            for (const entry of page.events) {
                const validated = validateChatEvent(entry);
                if (!validated.ok)
                    return { ok: false, reason: validated.reason };
                if (!belongsToRequestedThread(validated.event, query.threadId))
                    continue;
                if (!belongsToRequestedStream(validated.event, query.streamId))
                    continue;
                state = reduceChatEvent(state, validated.event).state;
            }
            if (page.done)
                break;
            const nextCursor = page.nextCursor;
            if (nextCursor === undefined)
                return { ok: false, reason: "invalid_page" };
            seenCursors.add(nextCursor);
            cursor = nextCursor;
        }
    }
    catch (error) {
        if (isAborted(query.signal) || isAbortError(error))
            return hydrateAbort();
        return error !== undefined
            ? { ok: false, reason: "load_failed", error }
            : { ok: false, reason: "load_failed" };
    }
    const resyncRequests = copyResyncRequests(state.resyncRequests);
    return {
        ok: true,
        runtime: createChatRuntime({ initialState: state }),
        resyncRequests,
        incomplete: Object.keys(resyncRequests).length > 0,
    };
}
/**
 * Select one thread's entities into a `thread.snapshot` event. The envelope
 * cursor is the existing stream high-water in `state`; this helper never
 * invents sequence zero.
 */
export function createThreadSnapshotEvent(input) {
    if (!isNonEmptyString(input.threadId) || !isNonEmptyString(input.id) || !isNonEmptyString(input.source)) {
        return { ok: false, reason: "invalid_event" };
    }
    if (!isNonEmptyString(input.streamId))
        return { ok: false, reason: "missing_cursor" };
    if (!isNonEmptyString(input.occurredAt))
        return { ok: false, reason: "invalid_event" };
    const occurredAt = input.occurredAt;
    const thread = input.state.threads[input.threadId];
    if (!thread)
        return { ok: false, reason: "unknown_thread" };
    const sequence = input.state.streamSequences[input.streamId];
    if (sequence === undefined)
        return { ok: false, reason: "missing_cursor" };
    const turns = Object.values(input.state.turns).filter((turn) => turn.threadId === input.threadId);
    const items = Object.values(input.state.items).filter((item) => item.threadId === input.threadId);
    const surfaces = Object.values(input.state.surfaces).filter((surface) => surface.threadId === input.threadId);
    const interactions = Object.values(input.state.interactions).filter((interaction) => interaction.threadId === input.threadId);
    const usage = input.state.usageByThread[input.threadId];
    const payload = {
        thread,
        turns,
        items,
        surfaces,
        interactions,
        ...(usage ? { usage } : {}),
    };
    return {
        ok: true,
        event: {
            protocolVersion: CHAT_PROTOCOL_VERSION,
            id: input.id,
            type: "thread.snapshot",
            source: input.source,
            occurredAt,
            threadId: input.threadId,
            stream: { id: input.streamId, sequence },
            payload,
        },
    };
}
const MEMORY_CURSOR_PREFIX = "m:";
function encodeMemoryCursor(index) {
    return `${MEMORY_CURSOR_PREFIX}${String(index)}`;
}
function decodeMemoryCursor(cursor) {
    if (cursor === undefined)
        return 0;
    if (!cursor.startsWith(MEMORY_CURSOR_PREFIX))
        return undefined;
    const raw = cursor.slice(MEMORY_CURSOR_PREFIX.length);
    if (!/^[0-9]+$/u.test(raw))
        return undefined;
    const index = Number(raw);
    return Number.isInteger(index) && index >= 0 ? index : undefined;
}
function eventMatchesJournalQuery(event, query) {
    if (event.threadId !== query.threadId)
        return false;
    if (query.streamId !== undefined && event.stream !== undefined && event.stream.id !== query.streamId) {
        return false;
    }
    if (query.after
        && event.stream
        && event.stream.id === query.after.streamId
        && event.stream.sequence <= query.after.sequence) {
        return false;
    }
    return true;
}
function latestMatchingSnapshot(snapshots, events, query) {
    const saved = [...snapshots.values()]
        .reverse()
        .find((candidate) => snapshotMatchesQuery(candidate, query));
    if (saved)
        return saved;
    for (let index = events.length - 1; index >= 0; index -= 1) {
        const event = events[index];
        if (!event || event.type !== "thread.snapshot")
            continue;
        if (snapshotMatchesQuery(event, query))
            return event;
    }
    return undefined;
}
function memorySnapshotKey(event) {
    return `${event.threadId}\u0000${event.stream?.id ?? ""}`;
}
function rememberMemorySnapshot(snapshots, event) {
    const key = memorySnapshotKey(event);
    snapshots.delete(key);
    snapshots.set(key, event);
}
/**
 * Volatile in-process journal and snapshot store for tests and local labs.
 * It preserves append order and uses opaque index cursors. It is not durable.
 */
export function createMemoryChatPersistence() {
    const events = [];
    const snapshots = new Map();
    return {
        async append(event, options) {
            throwIfAborted(options?.signal);
            events.push(event);
            if (event.type === "thread.snapshot")
                rememberMemorySnapshot(snapshots, event);
        },
        async loadSnapshot(query) {
            throwIfAborted(query.signal);
            return latestMatchingSnapshot(snapshots, events, query);
        },
        async readJournal(query) {
            throwIfAborted(query.signal);
            if (!isFinitePositiveInteger(query.limit)) {
                return { events: [], done: false };
            }
            const start = decodeMemoryCursor(query.cursor);
            if (start === undefined)
                return { events: [], done: false };
            const page = [];
            let index = start;
            let nextIndex = start;
            for (; index < events.length; index += 1) {
                const event = events[index];
                if (!event || !eventMatchesJournalQuery(event, query))
                    continue;
                page.push(event);
                nextIndex = index + 1;
                if (page.length === query.limit) {
                    let more = false;
                    for (let rest = index + 1; rest < events.length; rest += 1) {
                        const candidate = events[rest];
                        if (candidate && eventMatchesJournalQuery(candidate, query)) {
                            more = true;
                            break;
                        }
                    }
                    return more
                        ? { events: page, done: false, nextCursor: encodeMemoryCursor(nextIndex) }
                        : { events: page, done: true };
                }
            }
            return { events: page, done: true };
        },
        async saveSnapshot(event, options) {
            throwIfAborted(options?.signal);
            rememberMemorySnapshot(snapshots, event);
        },
    };
}
//# sourceMappingURL=persistence.js.map