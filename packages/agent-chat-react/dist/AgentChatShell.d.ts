import { type ReactNode } from "react";
import type { ChatState, ChatItem, JsonValue, PendingInteraction, SurfaceActionRef, SurfaceBlock } from "simplia-agent-chat/core";
import { type ChatComposerProps } from "./ChatComposer.js";
import { ReactSurfaceRegistry } from "./surface-registry.js";
export interface AgentChatShellProps {
    state: ChatState;
    threadId: string;
    surfaceRegistry: ReactSurfaceRegistry;
    title: string;
    subtitle?: string | undefined;
    onSubmit: ChatComposerProps["onSubmit"];
    onResolveInteraction: (interaction: PendingInteraction, resolution: JsonValue) => void | Promise<void>;
    onSurfaceAction?: ((block: SurfaceBlock, action: SurfaceActionRef, input?: JsonValue) => void) | undefined;
    composerAriaLabel: string;
    composerPlaceholder?: string | undefined;
    busy?: boolean | undefined;
    toolbar?: ReactNode | undefined;
    contextRail?: ReactNode | undefined;
    emptyLabel?: string | undefined;
    composer?: ReactNode | undefined;
    renderMessage?: ((item: ChatItem) => ReactNode) | undefined;
}
export declare function AgentChatShell({ state, threadId, surfaceRegistry, title, subtitle, onSubmit, onResolveInteraction, onSurfaceAction, composerAriaLabel, composerPlaceholder, busy, toolbar, contextRail, emptyLabel, composer, renderMessage, }: AgentChatShellProps): import("react").JSX.Element;
//# sourceMappingURL=AgentChatShell.d.ts.map