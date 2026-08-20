import { type ReactNode } from "react";
import { type AgentChatTheme } from "./copy.js";
export declare const AGENT_CHAT_WORKSPACE_PANE_IDS: Readonly<{
    history: "history";
    conversation: "conversation";
    workQueue: "workQueue";
    workbench: "workbench";
}>;
export type AgentChatWorkspacePaneId = (typeof AGENT_CHAT_WORKSPACE_PANE_IDS)[keyof typeof AGENT_CHAT_WORKSPACE_PANE_IDS];
export type AgentChatWorkspaceLayout = "home" | "work" | "mixed";
export interface AgentChatWorkspacePaneSlots {
    header?: ReactNode | undefined;
    body: ReactNode;
    footer?: ReactNode | undefined;
}
export interface AgentChatWorkspaceVisiblePanes {
    history?: boolean | undefined;
    conversation?: boolean | undefined;
    workQueue?: boolean | undefined;
    workbench?: boolean | undefined;
}
export type AgentChatWorkspacePaneContent = ReactNode | AgentChatWorkspacePaneSlots;
type AgentChatWorkspaceBaseProps = {
    ariaLabel: string;
    historyLabel: string;
    history: AgentChatWorkspacePaneContent;
    conversation: ReactNode;
    header?: ReactNode | undefined;
    visiblePanes?: AgentChatWorkspaceVisiblePanes | undefined;
    theme?: AgentChatTheme | undefined;
    className?: string | undefined;
};
type AgentChatWorkspaceQueueProps = {
    workQueue?: undefined;
    workQueueLabel?: undefined;
} | {
    workQueue: AgentChatWorkspacePaneContent;
    workQueueLabel: string;
};
type AgentChatWorkspaceWorkbenchProps = {
    workbench?: undefined;
    workbenchLabel?: undefined;
} | {
    workbench: AgentChatWorkspacePaneContent;
    workbenchLabel: string;
};
export type AgentChatWorkspaceProps = AgentChatWorkspaceBaseProps & AgentChatWorkspaceQueueProps & AgentChatWorkspaceWorkbenchProps;
export declare function AgentChatWorkspace(props: AgentChatWorkspaceProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=AgentChatWorkspace.d.ts.map