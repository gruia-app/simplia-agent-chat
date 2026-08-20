import { type ChatEvent, type ChatEventEnvelope, type ChatEventValidationReason, type ThreadSnapshot } from "./protocol.js";
import { type ChatRuntime } from "./runtime.js";
import { type ChatState, type ReduceResult, type ResyncRequest } from "./state.js";
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
    saveSnapshot?(event: ChatEventEnvelope<"thread.snapshot", ThreadSnapshot>, options?: ChatPersistenceAppendOptions): Promise<void>;
}
export interface CommitChatEventOptions {
    signal?: AbortSignal;
}
export type CommitChatEventResult = {
    ok: true;
    persisted: true;
    result: ReduceResult;
} | {
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
export type HydrateChatRuntimeReason = ChatEventValidationReason | "invalid_snapshot" | "foreign_snapshot" | "invalid_query" | "invalid_page" | "load_failed" | "aborted";
export type HydrateChatRuntimeResult = {
    ok: true;
    runtime: ChatRuntime;
    resyncRequests: Record<string, ResyncRequest>;
    incomplete: boolean;
} | {
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
export type CreateThreadSnapshotEventResult = {
    ok: true;
    event: ChatEventEnvelope<"thread.snapshot", ThreadSnapshot>;
} | {
    ok: false;
    reason: "unknown_thread" | "missing_cursor" | "invalid_event";
};
/**
 * Validate, append, then apply, in that order. Concurrent calls on the same
 * runtime run in call order. A successful append is not rolled back if the
 * reducer reports a duplicate, gap, or conflict.
 */
export declare function commitChatEvent(runtime: ChatRuntime, persistence: Pick<ChatPersistencePort, "append">, event: unknown, options?: CommitChatEventOptions): Promise<CommitChatEventResult>;
/**
 * Build a new runtime from an optional `thread.snapshot` plus bounded opaque
 * journal pages. Notifications do not run during hydration. Envelope poison
 * fails closed; reducer duplicate/stale/gap/conflict results continue so a
 * later high-water snapshot can recover.
 */
export declare function hydrateChatRuntime(persistence: Pick<ChatPersistencePort, "loadSnapshot" | "readJournal">, query: HydrateChatRuntimeQuery): Promise<HydrateChatRuntimeResult>;
/**
 * Select one thread's entities into a `thread.snapshot` event. The envelope
 * cursor is the existing stream high-water in `state`; this helper never
 * invents sequence zero.
 */
export declare function createThreadSnapshotEvent(input: CreateThreadSnapshotEventInput): CreateThreadSnapshotEventResult;
/**
 * Volatile in-process journal and snapshot store for tests and local labs.
 * It preserves append order and uses opaque index cursors. It is not durable.
 */
export declare function createMemoryChatPersistence(): ChatPersistencePort;
//# sourceMappingURL=persistence.d.ts.map