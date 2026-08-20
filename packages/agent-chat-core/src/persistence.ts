import {
  CHAT_PROTOCOL_VERSION,
  validateChatEvent,
  type ChatEvent,
  type ChatEventEnvelope,
  type ChatEventValidationReason,
  type ThreadSnapshot,
} from "./protocol.js";
import { createChatRuntime, type ChatRuntime } from "./runtime.js";
import {
  createInitialChatState,
  reduceChatEvent,
  type ChatState,
  type ReduceResult,
  type ResyncRequest,
} from "./state.js";

export interface ChatStreamCursor {
  streamId: string;
  sequence: number;
}

export interface ChatSnapshotQuery {
  threadId: string;
  streamId?: string;
  signal?: AbortSignal;
}

export interface ChatJournalQuery {
  threadId: string;
  streamId?: string;
  cursor?: string;
  after?: ChatStreamCursor;
  limit: number;
  signal?: AbortSignal;
}

export interface ChatJournalPage {
  events: unknown[];
  done: boolean;
  nextCursor?: string;
}

export interface ChatPersistenceAppendOptions {
  signal?: AbortSignal;
}

/**
 * Caller-owned snapshot/journal contract. Implementations must not assume a
 * sequence is a storage cursor, must keep pages finite, and must not hide
 * credentials or storage technology behind this port.
 */
export interface ChatPersistencePort {
  append(event: ChatEvent, options?: ChatPersistenceAppendOptions): Promise<void>;
  loadSnapshot(query: ChatSnapshotQuery): Promise<unknown>;
  readJournal(query: ChatJournalQuery): Promise<ChatJournalPage>;
  saveSnapshot?(
    event: ChatEventEnvelope<"thread.snapshot", ThreadSnapshot>,
    options?: ChatPersistenceAppendOptions,
  ): Promise<void>;
}

export interface CommitChatEventOptions {
  signal?: AbortSignal;
}

export type CommitChatEventResult =
  | { ok: true; persisted: true; result: ReduceResult }
  | {
      ok: false;
      persisted: false;
      reason: ChatEventValidationReason | "aborted" | "append_failed";
      error?: unknown;
    };

export interface HydrateChatRuntimeQuery {
  threadId: string;
  streamId?: string;
  limit: number;
  signal?: AbortSignal;
}

export type HydrateChatRuntimeReason =
  | ChatEventValidationReason
  | "invalid_snapshot"
  | "foreign_snapshot"
  | "invalid_query"
  | "invalid_page"
  | "load_failed"
  | "aborted";

export type HydrateChatRuntimeResult =
  | {
      ok: true;
      runtime: ChatRuntime;
      resyncRequests: Record<string, ResyncRequest>;
      incomplete: boolean;
    }
  | {
      ok: false;
      reason: HydrateChatRuntimeReason;
      error?: unknown;
    };

export interface CreateThreadSnapshotEventInput {
  state: ChatState;
  threadId: string;
  id: string;
  source: string;
  occurredAt: string;
  streamId: string;
}

export type CreateThreadSnapshotEventResult =
  | { ok: true; event: ChatEventEnvelope<"thread.snapshot", ThreadSnapshot> }
  | { ok: false; reason: "unknown_thread" | "missing_cursor" | "invalid_event" };

const commitTails = new WeakMap<ChatRuntime, Promise<void>>();

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isFinitePositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && Number.isFinite(value) && value > 0;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
}

function abortResult(): CommitChatEventResult {
  return { ok: false, persisted: false, reason: "aborted" };
}

function hydrateAbort(): HydrateChatRuntimeResult {
  return { ok: false, reason: "aborted" };
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (!isAborted(signal)) return;
  const error = new Error("The operation was aborted");
  error.name = "AbortError";
  throw error;
}

function copyResyncRequests(requests: Record<string, ResyncRequest>): Record<string, ResyncRequest> {
  return Object.fromEntries(
    Object.entries(requests).map(([streamId, request]) => [streamId, { ...request }]),
  );
}

function enqueueCommit<T>(runtime: ChatRuntime, work: () => Promise<T>): Promise<T> {
  const previous = commitTails.get(runtime) ?? Promise.resolve();
  const current = previous.then(work, work);
  commitTails.set(
    runtime,
    current.then(
      () => undefined,
      () => undefined,
    ),
  );
  return current;
}

function belongsToRequestedStream(event: ChatEvent, streamId: string | undefined): boolean {
  if (streamId === undefined || event.stream === undefined) return true;
  return event.stream.id === streamId;
}

function belongsToRequestedThread(event: ChatEvent, threadId: string): boolean {
  return event.threadId === threadId;
}

function snapshotMatchesQuery(
  event: ChatEventEnvelope<"thread.snapshot", ThreadSnapshot>,
  query: { threadId: string; streamId?: string },
): boolean {
  if (event.threadId !== query.threadId) return false;
  if (query.streamId !== undefined && event.stream !== undefined && event.stream.id !== query.streamId) {
    return false;
  }
  return true;
}

function asJournalPage(value: unknown): ChatJournalPage | undefined {
  if (!isPlainObject(value)) return undefined;
  if (!Array.isArray(value.events) || typeof value.done !== "boolean") return undefined;
  if (value.nextCursor !== undefined && !isNonEmptyString(value.nextCursor)) return undefined;
  const page: ChatJournalPage = {
    events: value.events,
    done: value.done,
  };
  if (isNonEmptyString(value.nextCursor)) page.nextCursor = value.nextCursor;
  return page;
}

function journalQuery(
  query: HydrateChatRuntimeQuery,
  cursor: string | undefined,
  after: ChatStreamCursor | undefined,
): ChatJournalQuery {
  const next: ChatJournalQuery = {
    threadId: query.threadId,
    limit: query.limit,
  };
  if (query.streamId !== undefined) next.streamId = query.streamId;
  if (cursor !== undefined) next.cursor = cursor;
  if (after !== undefined) next.after = after;
  if (query.signal !== undefined) next.signal = query.signal;
  return next;
}

/**
 * Validate, append, then apply, in that order. Concurrent calls on the same
 * runtime run in call order. A successful append is not rolled back if the
 * reducer reports a duplicate, gap, or conflict.
 */
export async function commitChatEvent(
  runtime: ChatRuntime,
  persistence: Pick<ChatPersistencePort, "append">,
  event: unknown,
  options?: CommitChatEventOptions,
): Promise<CommitChatEventResult> {
  if (isAborted(options?.signal)) return abortResult();

  return enqueueCommit(runtime, async () => {
    if (isAborted(options?.signal)) return abortResult();

    const validated = validateChatEvent(event);
    if (!validated.ok) {
      return { ok: false, persisted: false, reason: validated.reason };
    }
    if (isAborted(options?.signal)) return abortResult();

    try {
      await persistence.append(validated.event, options);
    } catch (error) {
      if (isAborted(options?.signal) || isAbortError(error)) return abortResult();
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
export async function hydrateChatRuntime(
  persistence: Pick<ChatPersistencePort, "loadSnapshot" | "readJournal">,
  query: HydrateChatRuntimeQuery,
): Promise<HydrateChatRuntimeResult> {
  if (!isNonEmptyString(query.threadId) || !isFinitePositiveInteger(query.limit)) {
    return { ok: false, reason: "invalid_query" };
  }
  if (query.streamId !== undefined && !isNonEmptyString(query.streamId)) {
    return { ok: false, reason: "invalid_query" };
  }
  if (isAborted(query.signal)) return hydrateAbort();

  let state = createInitialChatState();
  let after: ChatStreamCursor | undefined;

  try {
    const snapshotQuery: ChatSnapshotQuery = { threadId: query.threadId };
    if (query.streamId !== undefined) snapshotQuery.streamId = query.streamId;
    if (query.signal !== undefined) snapshotQuery.signal = query.signal;

    const rawSnapshot = await persistence.loadSnapshot(snapshotQuery);
    if (isAborted(query.signal)) return hydrateAbort();

    if (rawSnapshot !== undefined && rawSnapshot !== null) {
      const validated = validateChatEvent(rawSnapshot);
      if (!validated.ok) return { ok: false, reason: validated.reason };
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

    let cursor: string | undefined;
    const seenCursors = new Set<string>();

    for (;;) {
      if (isAborted(query.signal)) return hydrateAbort();
      const pageValue = await persistence.readJournal(journalQuery(query, cursor, after));
      if (isAborted(query.signal)) return hydrateAbort();

      const page = asJournalPage(pageValue);
      if (!page) return { ok: false, reason: "invalid_page" };

      if (!page.done) {
        if (page.events.length === 0) return { ok: false, reason: "invalid_page" };
        if (page.nextCursor === undefined) return { ok: false, reason: "invalid_page" };
        if (page.nextCursor === cursor || seenCursors.has(page.nextCursor)) {
          return { ok: false, reason: "invalid_page" };
        }
      }

      for (const entry of page.events) {
        const validated = validateChatEvent(entry);
        if (!validated.ok) return { ok: false, reason: validated.reason };
        if (!belongsToRequestedThread(validated.event, query.threadId)) continue;
        if (!belongsToRequestedStream(validated.event, query.streamId)) continue;
        state = reduceChatEvent(state, validated.event).state;
      }

      if (page.done) break;
      const nextCursor = page.nextCursor;
      if (nextCursor === undefined) return { ok: false, reason: "invalid_page" };
      seenCursors.add(nextCursor);
      cursor = nextCursor;
    }
  } catch (error) {
    if (isAborted(query.signal) || isAbortError(error)) return hydrateAbort();
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
export function createThreadSnapshotEvent(
  input: CreateThreadSnapshotEventInput,
): CreateThreadSnapshotEventResult {
  if (!isNonEmptyString(input.threadId) || !isNonEmptyString(input.id) || !isNonEmptyString(input.source)) {
    return { ok: false, reason: "invalid_event" };
  }
  if (!isNonEmptyString(input.streamId)) return { ok: false, reason: "missing_cursor" };
  if (!isNonEmptyString(input.occurredAt)) return { ok: false, reason: "invalid_event" };
  const occurredAt = input.occurredAt;

  const thread = input.state.threads[input.threadId];
  if (!thread) return { ok: false, reason: "unknown_thread" };

  const sequence = input.state.streamSequences[input.streamId];
  if (sequence === undefined) return { ok: false, reason: "missing_cursor" };

  const turns = Object.values(input.state.turns).filter((turn) => turn.threadId === input.threadId);
  const items = Object.values(input.state.items).filter((item) => item.threadId === input.threadId);
  const surfaces = Object.values(input.state.surfaces).filter((surface) => surface.threadId === input.threadId);
  const interactions = Object.values(input.state.interactions).filter(
    (interaction) => interaction.threadId === input.threadId,
  );
  const usage = input.state.usageByThread[input.threadId];
  const payload: ThreadSnapshot = {
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

function encodeMemoryCursor(index: number): string {
  return `${MEMORY_CURSOR_PREFIX}${String(index)}`;
}

function decodeMemoryCursor(cursor: string | undefined): number | undefined {
  if (cursor === undefined) return 0;
  if (!cursor.startsWith(MEMORY_CURSOR_PREFIX)) return undefined;
  const raw = cursor.slice(MEMORY_CURSOR_PREFIX.length);
  if (!/^[0-9]+$/u.test(raw)) return undefined;
  const index = Number(raw);
  return Number.isInteger(index) && index >= 0 ? index : undefined;
}

function eventMatchesJournalQuery(event: ChatEvent, query: ChatJournalQuery): boolean {
  if (event.threadId !== query.threadId) return false;
  if (query.streamId !== undefined && event.stream !== undefined && event.stream.id !== query.streamId) {
    return false;
  }
  if (
    query.after
    && event.stream
    && event.stream.id === query.after.streamId
    && event.stream.sequence <= query.after.sequence
  ) {
    return false;
  }
  return true;
}

function latestMatchingSnapshot(
  snapshots: Map<string, ChatEventEnvelope<"thread.snapshot", ThreadSnapshot>>,
  events: ChatEvent[],
  query: ChatSnapshotQuery,
): ChatEventEnvelope<"thread.snapshot", ThreadSnapshot> | undefined {
  const saved = [...snapshots.values()]
    .reverse()
    .find((candidate) => snapshotMatchesQuery(candidate, query));
  if (saved) return saved;

  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (!event || event.type !== "thread.snapshot") continue;
    if (snapshotMatchesQuery(event, query)) return event;
  }
  return undefined;
}

function memorySnapshotKey(
  event: ChatEventEnvelope<"thread.snapshot", ThreadSnapshot>,
): string {
  return `${event.threadId}\u0000${event.stream?.id ?? ""}`;
}

function rememberMemorySnapshot(
  snapshots: Map<string, ChatEventEnvelope<"thread.snapshot", ThreadSnapshot>>,
  event: ChatEventEnvelope<"thread.snapshot", ThreadSnapshot>,
): void {
  const key = memorySnapshotKey(event);
  snapshots.delete(key);
  snapshots.set(key, event);
}

/**
 * Volatile in-process journal and snapshot store for tests and local labs.
 * It preserves append order and uses opaque index cursors. It is not durable.
 */
export function createMemoryChatPersistence(): ChatPersistencePort {
  const events: ChatEvent[] = [];
  const snapshots = new Map<string, ChatEventEnvelope<"thread.snapshot", ThreadSnapshot>>();

  return {
    async append(event, options) {
      throwIfAborted(options?.signal);
      events.push(event);
      if (event.type === "thread.snapshot") rememberMemorySnapshot(snapshots, event);
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
      if (start === undefined) return { events: [], done: false };

      const page: unknown[] = [];
      let index = start;
      let nextIndex = start;
      for (; index < events.length; index += 1) {
        const event = events[index];
        if (!event || !eventMatchesJournalQuery(event, query)) continue;
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
