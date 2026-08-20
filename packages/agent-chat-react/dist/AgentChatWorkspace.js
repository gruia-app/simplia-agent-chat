"use client";
import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { isValidElement } from "react";
import { sacThemeAttributes } from "./copy.js";
export const AGENT_CHAT_WORKSPACE_PANE_IDS = Object.freeze({
    history: "history",
    conversation: "conversation",
    workQueue: "workQueue",
    workbench: "workbench",
});
function isWorkspacePaneSlots(value) {
    if (value == null || typeof value !== "object")
        return false;
    if (Array.isArray(value))
        return false;
    if (isValidElement(value))
        return false;
    if ("$$typeof" in value)
        return false;
    return Object.prototype.hasOwnProperty.call(value, "body");
}
function isPaneVisible(visiblePanes, id) {
    if (!visiblePanes)
        return true;
    return visiblePanes[id] !== false;
}
function labeledSlot(content, label) {
    if (content === undefined)
        return undefined;
    return { content, label: typeof label === "string" ? label : "" };
}
function renderStructuredPane(content) {
    if (!isWorkspacePaneSlots(content)) {
        return _jsx("div", { className: "sac-workspace-pane-body", children: content });
    }
    return (_jsxs(_Fragment, { children: [content.header != null ? _jsx("div", { className: "sac-workspace-pane-header", children: content.header }) : null, _jsx("div", { className: "sac-workspace-pane-body", children: content.body }), content.footer != null ? _jsx("div", { className: "sac-workspace-pane-footer", children: content.footer }) : null] }));
}
function workspaceClassName(className) {
    return className ? `sac-workspace ${className}` : "sac-workspace";
}
function resolveLayout(args) {
    if (args.history && args.conversation && !args.workQueue && !args.workbench)
        return "home";
    if (args.history && args.conversation && args.workQueue && args.workbench)
        return "work";
    return "mixed";
}
export function AgentChatWorkspace(props) {
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
    return (_jsxs("div", { className: workspaceClassName(props.className), role: "region", "aria-label": props.ariaLabel, "data-sac-workspace": "", "data-sac-workspace-layout": layout, ...sacThemeAttributes(props.theme), children: [props.header != null ? _jsx("header", { className: "sac-workspace-header", children: props.header }) : null, _jsxs("div", { className: "sac-workspace-body", children: [showHistory ? (_jsx("nav", { className: "sac-workspace-pane sac-workspace-history", "data-sac-pane": AGENT_CHAT_WORKSPACE_PANE_IDS.history, "aria-label": props.historyLabel, children: renderStructuredPane(props.history) })) : null, showConversation ? (_jsx("div", { className: "sac-workspace-pane sac-workspace-conversation", "data-sac-pane": AGENT_CHAT_WORKSPACE_PANE_IDS.conversation, children: props.conversation })) : null, showQueue && queue ? (_jsx("aside", { className: "sac-workspace-pane sac-workspace-queue", "data-sac-pane": AGENT_CHAT_WORKSPACE_PANE_IDS.workQueue, "aria-label": queue.label, children: renderStructuredPane(queue.content) })) : null, showWorkbench && workbench ? (_jsx("section", { className: "sac-workspace-pane sac-workspace-workbench", "data-sac-pane": AGENT_CHAT_WORKSPACE_PANE_IDS.workbench, "aria-label": workbench.label, children: renderStructuredPane(workbench.content) })) : null] })] }));
}
//# sourceMappingURL=AgentChatWorkspace.js.map