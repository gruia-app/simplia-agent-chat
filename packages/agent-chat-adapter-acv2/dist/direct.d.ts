import { type ChatTransportAdapter } from "simplia-agent-chat/core/protocol";
export interface Acv2DirectChatExchange {
    /** Stable client-generated ID for one user/assistant exchange. */
    exchange_id: string;
    role?: string;
    provider?: string;
    model?: string;
    reasoning_effort?: string;
    request: {
        message?: unknown;
    };
    response: {
        response?: unknown;
        session_id?: unknown;
        conversation_id?: unknown;
        tokens_used?: unknown;
        cost_usd?: unknown;
        tool_calls?: unknown;
    };
}
export declare const acv2DirectChatAdapter: ChatTransportAdapter<Acv2DirectChatExchange>;
//# sourceMappingURL=direct.d.ts.map