import { type ReactNode } from "react";
import { type ChatItem, type ChatState, type JsonValue, type SurfaceActionRef, type SurfaceBlock } from "simplia-agent-chat/core";
import { ReactSurfaceRegistry } from "./surface-registry.js";
export interface ChatTimelineProps {
    state: ChatState;
    threadId: string;
    surfaceRegistry: ReactSurfaceRegistry;
    onSurfaceAction?: ((block: SurfaceBlock, action: SurfaceActionRef, input?: JsonValue) => void) | undefined;
    emptyLabel?: string | undefined;
    renderMessage?: ((item: ChatItem) => ReactNode) | undefined;
}
export declare function ChatTimeline({ state, threadId, surfaceRegistry, onSurfaceAction, emptyLabel, renderMessage, }: ChatTimelineProps): import("react").JSX.Element;
//# sourceMappingURL=ChatTimeline.d.ts.map