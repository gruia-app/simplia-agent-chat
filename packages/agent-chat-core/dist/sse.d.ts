export interface SseMessage {
    event: string;
    data: string;
    id?: string;
    retry?: number;
}
export interface SseDecoderOptions {
    maxBufferChars?: number;
    maxEventChars?: number;
}
export declare class SseDecoder {
    #private;
    constructor(options?: SseDecoderOptions);
    push(chunk: string): SseMessage[];
    flush(): SseMessage[];
    reset(): void;
}
export declare function decodeSsePayload<T = unknown>(message: SseMessage): T | "[DONE]";
//# sourceMappingURL=sse.d.ts.map