import { type ChatState, type ReduceResult } from "./state.js";
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
export declare function createChatRuntime(options?: CreateChatRuntimeOptions): ChatRuntime;
//# sourceMappingURL=runtime.d.ts.map