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
export function purgeThreadFromState(state: ChatState, threadId: string): ChatState {
  if (!(threadId in state.threads)
    && !Object.values(state.turns).some((turn) => turn.threadId === threadId)) {
    return state;
  }
  return {
    ...state,
    threads: omit(state.threads, threadId),
    turns: filterByThread(state.turns, threadId),
    items: filterByThread(state.items, threadId),
    surfaces: filterByThread(state.surfaces, threadId),
    interactions: filterByThread(state.interactions, threadId),
    usageByThread: omit(state.usageByThread, threadId),
  };
}

function omit<T>(record: Record<string, T>, key: string): Record<string, T> {
  if (!(key in record)) return record;
  const next = { ...record };
  delete next[key];
  return next;
}

function filterByThread<T extends { threadId?: string }>(
  record: Record<string, T>,
  threadId: string,
): Record<string, T> {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value.threadId !== threadId),
  );
}
