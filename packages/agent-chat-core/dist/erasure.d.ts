import type { ChatState } from "./state.js";
/**
 * Thread erasure for data-lifecycle flows (export/delete-account style jobs).
 * Removes every entity owned by the thread from an in-memory `ChatState` —
 * threads, turns, items, surfaces, interactions, usage and pending resync
 * bookkeeping owned by that thread — without touching other threads.
 *
 * Durable erasure stays application-owned: this only purges the reduced state;
 * the app's `ChatPersistencePort` backend must delete journal/snapshot rows
 * itself. Stream sequences and seen event ids are global replay guards and are
 * intentionally kept so a late duplicated event cannot resurrect the thread.
 */
export declare function purgeThreadFromState(state: ChatState, threadId: string): ChatState;
//# sourceMappingURL=erasure.d.ts.map