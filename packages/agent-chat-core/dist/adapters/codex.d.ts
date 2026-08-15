import { type ChatTransportAdapter } from "../protocol.js";
export interface CodexAppServerMessage {
    id?: string | number;
    method?: string;
    params?: unknown;
}
export declare const codexAppServerAdapter: ChatTransportAdapter<CodexAppServerMessage>;
//# sourceMappingURL=codex.d.ts.map