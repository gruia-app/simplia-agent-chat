import { type ChatTransportAdapter } from "../protocol.js";
export interface OpenAiCompatibleChunk {
    id?: string;
    model?: string;
    provider?: string;
    choices?: unknown[];
    usage?: unknown;
    error?: unknown;
}
export interface OpenAiCompatibleAdapterOptions {
    id?: string;
    provider?: string;
}
export declare function createOpenAiCompatibleAdapter(options?: OpenAiCompatibleAdapterOptions): ChatTransportAdapter<OpenAiCompatibleChunk | "[DONE]">;
export declare const openRouterAdapter: ChatTransportAdapter<"[DONE]" | OpenAiCompatibleChunk>;
//# sourceMappingURL=openai-compatible.d.ts.map