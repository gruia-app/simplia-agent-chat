import { type ChatEvent, type ChatItem, type ChatThread, type ChatTurn, type ChatUsage, type PendingInteraction, type SurfaceBlock } from "./protocol.js";
export interface ResyncRequest {
    streamId: string;
    expectedSequence: number;
    receivedSequence: number;
    eventId: string;
}
export interface ChatState {
    threads: Record<string, ChatThread>;
    turns: Record<string, ChatTurn>;
    items: Record<string, ChatItem>;
    surfaces: Record<string, SurfaceBlock>;
    interactions: Record<string, PendingInteraction>;
    usageByThread: Record<string, ChatUsage>;
    streamSequences: Record<string, number>;
    seenEventIds: string[];
    resyncRequests: Record<string, ResyncRequest>;
    warnings: Array<{
        code: string;
        message: string;
        eventId: string;
    }>;
}
export interface ReduceResult {
    state: ChatState;
    applied: boolean;
    reason?: "duplicate" | "stale_stream_event" | "stream_gap" | "surface_conflict" | "invalid_turn_transition" | "invalid_event" | "unsupported_protocol" | "unknown_event_type";
}
export declare function createInitialChatState(): ChatState;
export declare function reduceChatEvent(state: ChatState, event: unknown): ReduceResult;
export declare function replayChatEvents(events: Iterable<ChatEvent>, initial?: ChatState): ChatState;
export declare function selectThreadTurns(state: ChatState, threadId: string): ChatTurn[];
export declare function selectTurnItems(state: ChatState, turnId: string): ChatItem[];
export declare function selectPendingInteraction(state: ChatState, threadId: string): PendingInteraction | undefined;
//# sourceMappingURL=state.d.ts.map