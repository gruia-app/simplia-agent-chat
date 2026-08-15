import { type ComponentType, type ReactNode } from "react";
import { type JsonValue, type SurfaceActionRef, type SurfaceBlock, type SurfacePlugin } from "simplia-agent-chat/core";
export interface SurfaceRendererProps<TPayload extends JsonValue> {
    block: SurfaceBlock<TPayload>;
    onAction?: ((action: SurfaceActionRef, input?: JsonValue) => void) | undefined;
}
export interface ReactSurfacePlugin<TPayload extends JsonValue = JsonValue> extends SurfacePlugin<TPayload> {
    component: ComponentType<SurfaceRendererProps<TPayload>>;
}
interface DecodedReactSurface {
    block: SurfaceBlock;
    plugin: ReactSurfacePlugin;
}
export declare class ReactSurfaceRegistry {
    #private;
    register<TPayload extends JsonValue>(plugin: ReactSurfacePlugin<TPayload>): () => void;
    decode(block: SurfaceBlock): DecodedReactSurface | undefined;
    kinds(): string[];
}
export interface SurfaceHostProps {
    block: SurfaceBlock;
    registry: ReactSurfaceRegistry;
    onAction?: ((block: SurfaceBlock, action: SurfaceActionRef, input?: JsonValue) => void) | undefined;
    fallback?: ((block: SurfaceBlock, reason: "unknown" | "invalid") => ReactNode) | undefined;
}
export declare function SurfaceHost({ block, registry, onAction, fallback }: SurfaceHostProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=surface-registry.d.ts.map