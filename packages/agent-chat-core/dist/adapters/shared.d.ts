import { type AdapterContext, type ChatEvent, type ProviderMetadata } from "../protocol.js";
export declare function event<T extends ChatEvent["type"]>(type: T, context: AdapterContext, suffix: string, payload: Extract<ChatEvent, {
    type: T;
}>["payload"], provider?: ProviderMetadata): Extract<ChatEvent, {
    type: T;
}>;
export declare function providerFrom(input: unknown, fallback: string): ProviderMetadata;
export declare function stableSuffix(...parts: Array<string | number | undefined>): string;
export declare function scopeToThread(threadId: string, nativeId: string): string;
export declare function threadScopedTurnId(threadId: string, nativeTurnId?: string): string;
export declare function threadScopedEntityId(threadId: string, nativeId: string | undefined, fallback: string): string;
//# sourceMappingURL=shared.d.ts.map