import { type ChatTransportAdapter } from "simplia-agent-chat/core/protocol";
export interface Acv2DurableEvent {
    cursor?: number;
    event_kind?: string;
    run_id?: string;
    thread_id?: string;
    created_at?: string;
    payload?: unknown;
}
export declare const acv2PmAdapter: ChatTransportAdapter<Acv2DurableEvent>;
export declare const ACV2_DURABLE_EVENT_KINDS: readonly ["message_delta", "message_completed", "tool_use", "tool_result", "run_status", "system"];
//# sourceMappingURL=acv2.d.ts.map