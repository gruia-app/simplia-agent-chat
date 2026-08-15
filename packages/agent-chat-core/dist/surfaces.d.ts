import { type JsonValue, type SurfaceActionRef, type SurfaceBlock } from "./protocol.js";
export interface SurfacePlugin<TPayload extends JsonValue = JsonValue> {
    kind: string;
    versions: readonly number[];
    validate(payload: unknown, version: number): TPayload;
    summarize(payload: TPayload): string;
    getA11yLabel(payload: TPayload): string;
}
export interface DecodedSurface<TPayload extends JsonValue = JsonValue> {
    block: SurfaceBlock<TPayload>;
    plugin: SurfacePlugin<TPayload>;
}
export interface SurfaceActionCommand {
    idempotencyKey: string;
    threadId: string;
    turnId?: string;
    surfaceId: string;
    revision: number;
    actionId: string;
    action: string;
    input?: JsonValue;
}
export declare class SurfaceRegistry {
    #private;
    register(plugin: SurfacePlugin): () => void;
    resolve(kind: string): SurfacePlugin | undefined;
    kinds(): string[];
    decode(block: SurfaceBlock): DecodedSurface | undefined;
}
export declare function createSurfaceActionCommand(args: {
    block: SurfaceBlock;
    actionId: string;
    input?: unknown;
    idempotencyKey: string;
}): SurfaceActionCommand;
export declare function findSurfaceAction(block: SurfaceBlock, actionId: string): SurfaceActionRef | undefined;
export declare function unknownSurfaceSummary(block: SurfaceBlock): string;
//# sourceMappingURL=surfaces.d.ts.map