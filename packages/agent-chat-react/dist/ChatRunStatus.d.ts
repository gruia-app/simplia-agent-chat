import { type ChatTurn, type ThreadRunState } from "simplia-agent-chat/core";
import { type AgentChatCopyOverrides, type AgentChatTheme } from "./copy.js";
export interface ChatRunStatusProps {
    runState: ThreadRunState;
    onInterrupt?: ((turn: ChatTurn) => void | Promise<void>) | undefined;
    copy?: AgentChatCopyOverrides | undefined;
    theme?: AgentChatTheme | undefined;
}
export declare function ChatRunStatus({ runState, onInterrupt, copy, theme }: ChatRunStatusProps): import("react").JSX.Element;
//# sourceMappingURL=ChatRunStatus.d.ts.map