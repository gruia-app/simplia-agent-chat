import { createInitialChatState, reduceChatEvent, type ChatState, type ReduceResult } from "./state.js";

export type ChatRuntimeListener = () => void;

export type ChatRuntimeListenerErrorHandler = (error: unknown) => void;

export interface CreateChatRuntimeOptions {
  initialState?: ChatState;
  onListenerError?: ChatRuntimeListenerErrorHandler;
}

export interface ChatRuntime {
  getState(): ChatState;
  apply(event: unknown): ReduceResult;
  subscribe(listener: ChatRuntimeListener): () => void;
}

/**
 * Thin synchronous facade over `reduceChatEvent`. The reducer remains the only
 * projection authority; this helper never clones, freezes, reorders, or mints
 * events or state.
 */
export function createChatRuntime(options: CreateChatRuntimeOptions = {}): ChatRuntime {
  let state = options.initialState ?? createInitialChatState();
  const listeners: ChatRuntimeListener[] = [];
  const onListenerError = options.onListenerError;

  function notify(): void {
    const generation = listeners.slice();
    for (const listener of generation) {
      try {
        listener();
      } catch (error) {
        if (!onListenerError) continue;
        try {
          onListenerError(error);
        } catch {
          // Listener and hook errors must not escape apply() or starve later listeners.
        }
      }
    }
  }

  return {
    getState(): ChatState {
      return state;
    },
    apply(event: unknown): ReduceResult {
      const result = reduceChatEvent(state, event);
      const previous = state;
      state = result.state;
      if (state !== previous) notify();
      return result;
    },
    subscribe(listener: ChatRuntimeListener): () => void {
      listeners.push(listener);
      let subscribed = true;
      return () => {
        if (!subscribed) return;
        subscribed = false;
        const index = listeners.indexOf(listener);
        if (index >= 0) listeners.splice(index, 1);
      };
    },
  };
}
