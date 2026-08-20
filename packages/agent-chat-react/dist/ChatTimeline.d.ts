import { type ReactNode } from "react";
import { type ChatItem, type ChatState, type JsonValue, type SurfaceActionRef, type SurfaceBlock } from "simplia-agent-chat/core";
import { type AgentChatCopyOverrides, type AgentChatTheme } from "./copy.js";
import { ReactSurfaceRegistry } from "./surface-registry.js";
export interface ChatTimelineProps {
    state: ChatState;
    threadId: string;
    surfaceRegistry: ReactSurfaceRegistry;
    onSurfaceAction?: ((block: SurfaceBlock, action: SurfaceActionRef, input?: JsonValue) => void) | undefined;
    emptyLabel?: string | undefined;
    renderMessage?: ((item: ChatItem) => ReactNode) | undefined;
    copy?: AgentChatCopyOverrides | undefined;
    theme?: AgentChatTheme | undefined;
}
export declare function ChatTimeline({ state, threadId, surfaceRegistry, onSurfaceAction, emptyLabel, renderMessage, copy, theme, }: ChatTimelineProps): import("react").JSX.Element;
//# sourceMappingURL=ChatTimeline.d.ts.map