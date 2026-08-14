import { type ChatTransportAdapter } from "../protocol.js";
export interface LangChainStreamInput {
    mode?: "updates" | "messages" | "custom" | "events";
    data?: unknown;
    event?: string;
    name?: string;
    run_id?: string;
    metadata?: unknown;
}
export declare const langChainAdapter: ChatTransportAdapter<LangChainStreamInput>;
//# sourceMappingURL=langchain.d.ts.map