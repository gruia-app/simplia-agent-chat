"use client";

import { isValidElement, type ReactNode } from "react";
import { sacThemeAttributes, type AgentChatTheme } from "./copy.js";

export const AGENT_CHAT_WORKSPACE_PANE_IDS = Object.freeze({
  history: "history",
  conversation: "conversation",
  workQueue: "workQueue",
  workbench: "workbench",
});

export type AgentChatWorkspacePaneId =
  (typeof AGENT_CHAT_WORKSPACE_PANE_IDS)[keyof typeof AGENT_CHAT_WORKSPACE_PANE_IDS];

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

type AgentChatWorkspaceQueueProps =
  | {
      workQueue?: undefined;
      workQueueLabel?: undefined;
    }
  | {
      workQueue: AgentChatWorkspacePaneContent;
      workQueueLabel: string;
    };

type AgentChatWorkspaceWorkbenchProps =
  | {
      workbench?: undefined;
      workbenchLabel?: undefined;
    }
  | {
      workbench: AgentChatWorkspacePaneContent;
      workbenchLabel: string;
    };

export type AgentChatWorkspaceProps =
  AgentChatWorkspaceBaseProps
  & AgentChatWorkspaceQueueProps
  & AgentChatWorkspaceWorkbenchProps;

function isWorkspacePaneSlots(value: unknown): value is AgentChatWorkspacePaneSlots {
  if (value == null || typeof value !== "object") return false;
  if (Array.isArray(value)) return false;
  if (isValidElement(value)) return false;
  if ("$$typeof" in value) return false;
  return Object.prototype.hasOwnProperty.call(value, "body");
}

function isPaneVisible(
  visiblePanes: AgentChatWorkspaceVisiblePanes | undefined,
  id: AgentChatWorkspacePaneId,
): boolean {
  if (!visiblePanes) return true;
  return visiblePanes[id] !== false;
}

function labeledSlot(
  content: AgentChatWorkspacePaneContent | undefined,
  label: string | undefined,
): { content: AgentChatWorkspacePaneContent; label: string } | undefined {
  if (content === undefined) return undefined;
  return { content, label: typeof label === "string" ? label : "" };
}

function renderStructuredPane(content: AgentChatWorkspacePaneContent): ReactNode {
  if (!isWorkspacePaneSlots(content)) {
    return <div className="sac-workspace-pane-body">{content}</div>;
  }
  return (
    <>
      {content.header != null ? <div className="sac-workspace-pane-header">{content.header}</div> : null}
      <div className="sac-workspace-pane-body">{content.body}</div>
      {content.footer != null ? <div className="sac-workspace-pane-footer">{content.footer}</div> : null}
    </>
  );
}

function workspaceClassName(className: string | undefined): string {
  return className ? `sac-workspace ${className}` : "sac-workspace";
}

function resolveLayout(args: {
  history: boolean;
  conversation: boolean;
  workQueue: boolean;
  workbench: boolean;
}): AgentChatWorkspaceLayout {
  if (args.history && args.conversation && !args.workQueue && !args.workbench) return "home";
  if (args.history && args.conversation && args.workQueue && args.workbench) return "work";
  return "mixed";
}

export function AgentChatWorkspace(props: AgentChatWorkspaceProps) {
  const showHistory = isPaneVisible(props.visiblePanes, AGENT_CHAT_WORKSPACE_PANE_IDS.history);
  const showConversation = isPaneVisible(props.visiblePanes, AGENT_CHAT_WORKSPACE_PANE_IDS.conversation);
  const queue = labeledSlot(props.workQueue, props.workQueueLabel);
  const workbench = labeledSlot(props.workbench, props.workbenchLabel);
  const showQueue = Boolean(queue) && isPaneVisible(props.visiblePanes, AGENT_CHAT_WORKSPACE_PANE_IDS.workQueue);
  const showWorkbench = Boolean(workbench)
    && isPaneVisible(props.visiblePanes, AGENT_CHAT_WORKSPACE_PANE_IDS.workbench);
  const layout = resolveLayout({
    history: showHistory,
    conversation: showConversation,
    workQueue: showQueue,
    workbench: showWorkbench,
  });

  return (
    <div
      className={workspaceClassName(props.className)}
      role="region"
      aria-label={props.ariaLabel}
      data-sac-workspace=""
      data-sac-workspace-layout={layout}
      {...sacThemeAttributes(props.theme)}
    >
      {props.header != null ? <header className="sac-workspace-header">{props.header}</header> : null}
      <div className="sac-workspace-body">
        {showHistory ? (
          <nav
            className="sac-workspace-pane sac-workspace-history"
            data-sac-pane={AGENT_CHAT_WORKSPACE_PANE_IDS.history}
            aria-label={props.historyLabel}
          >
            {renderStructuredPane(props.history)}
          </nav>
        ) : null}
        {showConversation ? (
          <div
            className="sac-workspace-pane sac-workspace-conversation"
            data-sac-pane={AGENT_CHAT_WORKSPACE_PANE_IDS.conversation}
          >
            {props.conversation}
          </div>
        ) : null}
        {showQueue && queue ? (
          <aside
            className="sac-workspace-pane sac-workspace-queue"
            data-sac-pane={AGENT_CHAT_WORKSPACE_PANE_IDS.workQueue}
            aria-label={queue.label}
          >
            {renderStructuredPane(queue.content)}
          </aside>
        ) : null}
        {showWorkbench && workbench ? (
          <section
            className="sac-workspace-pane sac-workspace-workbench"
            data-sac-pane={AGENT_CHAT_WORKSPACE_PANE_IDS.workbench}
            aria-label={workbench.label}
          >
            {renderStructuredPane(workbench.content)}
          </section>
        ) : null}
      </div>
    </div>
  );
}
