"use client";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo } from "react";
import { ChatComposer } from "./ChatComposer.js";
import { ChatTimeline } from "./ChatTimeline.js";
import { PendingInteractions } from "./PendingInteractions.js";
import { useFollowScroll } from "./use-follow-scroll.js";
export function AgentChatShell({ state, threadId, surfaceRegistry, title, subtitle, onSubmit, onResolveInteraction, onSurfaceAction, composerAriaLabel, composerPlaceholder, busy = false, toolbar, contextRail, emptyLabel, composer, renderMessage, }) {
    const interactions = useMemo(() => Object.values(state.interactions).filter((interaction) => interaction.threadId === threadId), [state.interactions, threadId]);
    const contentVersion = useMemo(() => {
        const threadTurnIds = new Set(Object.values(state.turns)
            .filter((turn) => turn.threadId === threadId)
            .map((turn) => turn.id));
        const itemCount = Object.values(state.items)
            .filter((item) => item.threadId === threadId && threadTurnIds.has(item.turnId))
            .length;
        const surfaceRevisions = Object.values(state.surfaces)
            .filter((surface) => surface.threadId === threadId)
            .map((surface) => `${surface.id}.${surface.revision}`)
            .join("|");
        const lastEventId = state.seenEventIds.at(-1) ?? "initial";
        const pendingCount = interactions.filter((entry) => entry.status === "pending").length;
        return `${lastEventId}:${threadTurnIds.size}:${itemCount}:${surfaceRevisions}:${pendingCount}`;
    }, [interactions, state.items, state.seenEventIds, state.surfaces, state.turns, threadId]);
    const follow = useFollowScroll(contentVersion);
    return (_jsxs("section", { className: "sac-shell", "aria-label": title, children: [_jsxs("header", { className: "sac-header", children: [_jsxs("div", { children: [_jsx("span", { className: "sac-eyebrow", children: "SHARED_AGENT_CHAT" }), _jsx("h2", { children: title }), subtitle ? _jsx("p", { children: subtitle }) : null] }), _jsx("div", { className: "sac-toolbar", children: toolbar })] }), contextRail ? _jsx("div", { className: "sac-context-rail", children: contextRail }) : null, _jsxs("div", { className: "sac-chat-stage", children: [_jsx("div", { className: "sac-scroll-region", ref: follow.containerRef, onScroll: follow.onScroll, tabIndex: 0, children: _jsx(ChatTimeline, { state: state, threadId: threadId, surfaceRegistry: surfaceRegistry, ...(emptyLabel ? { emptyLabel } : {}), ...(renderMessage ? { renderMessage } : {}), ...(onSurfaceAction ? { onSurfaceAction } : {}) }) }), follow.mode === "free-scrolling" ? (_jsx("button", { className: "sac-jump-button", type: "button", onClick: () => follow.scrollToEnd("smooth"), children: "Return to live" })) : null] }), _jsxs("div", { className: "sac-input-rail", children: [_jsx(PendingInteractions, { interactions: interactions, onResolve: onResolveInteraction }), composer ?? (_jsx(ChatComposer, { onSubmit: onSubmit, ariaLabel: composerAriaLabel, ...(composerPlaceholder ? { placeholder: composerPlaceholder } : {}), busy: busy }))] })] }));
}
//# sourceMappingURL=AgentChatShell.js.map