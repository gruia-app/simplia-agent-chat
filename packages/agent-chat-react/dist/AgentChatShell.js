"use client";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useId, useMemo } from "react";
import { selectThreadSurfaces, } from "simplia-agent-chat/core";
import { ChatComposer } from "./ChatComposer.js";
import { ChatTimeline } from "./ChatTimeline.js";
import { PendingInteractions } from "./PendingInteractions.js";
import { SurfaceHost } from "./surface-registry.js";
import { useFollowScroll } from "./use-follow-scroll.js";
function surfaceSlotProps(surfaces, surfaceRegistry, onSurfaceAction) {
    return {
        surfaces,
        surfaceRegistry,
        ...(onSurfaceAction ? { onSurfaceAction } : {}),
    };
}
function DefaultArtifactStage({ surfaces, surfaceRegistry, onSurfaceAction, label, }) {
    const headingId = useId();
    return (_jsxs("aside", { className: "sac-artifact-stage", "aria-labelledby": headingId, children: [_jsx("div", { className: "sac-artifact-stage-header", children: _jsx("h3", { id: headingId, children: label }) }), _jsx("div", { className: "sac-artifact-stage-scroll", children: surfaces.map((surface) => (_jsx(SurfaceHost, { block: surface, registry: surfaceRegistry, ...(onSurfaceAction ? { onAction: onSurfaceAction } : {}) }, surface.id))) })] }));
}
export function AgentChatShell({ state, threadId, surfaceRegistry, title, subtitle, onSubmit, onResolveInteraction, onSurfaceAction, composerAriaLabel, composerPlaceholder, busy = false, toolbar, contextRail, emptyLabel, composer, renderMessage, artifactStageLabel = "Artifacts", renderArtifactStage, renderFullscreenSurfaces, }) {
    const interactions = useMemo(() => Object.values(state.interactions).filter((interaction) => interaction.threadId === threadId), [state.interactions, threadId]);
    const panelSurfaces = useMemo(() => selectThreadSurfaces(state, threadId, "panel"), [state, threadId]);
    const fullscreenSurfaces = useMemo(() => selectThreadSurfaces(state, threadId, "fullscreen"), [state, threadId]);
    const contentVersion = useMemo(() => {
        const threadTurnIds = new Set(Object.values(state.turns)
            .filter((turn) => turn.threadId === threadId)
            .map((turn) => turn.id));
        const itemCount = Object.values(state.items)
            .filter((item) => item.threadId === threadId && threadTurnIds.has(item.turnId))
            .length;
        const surfaceRevisions = selectThreadSurfaces(state, threadId, "inline")
            .map((surface) => `${surface.id}.${surface.revision}`)
            .join("|");
        const lastEventId = state.seenEventIds.at(-1) ?? "initial";
        const pendingCount = interactions.filter((entry) => entry.status === "pending").length;
        return `${lastEventId}:${threadTurnIds.size}:${itemCount}:${surfaceRevisions}:${pendingCount}`;
    }, [interactions, state.items, state.seenEventIds, state.surfaces, state.turns, threadId]);
    const follow = useFollowScroll(contentVersion);
    const slotProps = surfaceSlotProps(panelSurfaces, surfaceRegistry, onSurfaceAction);
    const hasArtifactStage = panelSurfaces.length > 0;
    const chatStage = (_jsxs("div", { className: "sac-chat-stage", children: [_jsx("div", { className: "sac-scroll-region", ref: follow.containerRef, onScroll: follow.onScroll, tabIndex: 0, children: _jsx(ChatTimeline, { state: state, threadId: threadId, surfaceRegistry: surfaceRegistry, ...(emptyLabel ? { emptyLabel } : {}), ...(renderMessage ? { renderMessage } : {}), ...(onSurfaceAction ? { onSurfaceAction } : {}) }) }), follow.mode === "free-scrolling" ? (_jsx("button", { className: "sac-jump-button", type: "button", onClick: () => follow.scrollToEnd("smooth"), children: "Return to live" })) : null] }));
    return (_jsxs("section", { className: "sac-shell", "aria-label": title, children: [_jsxs("header", { className: "sac-header", children: [_jsxs("div", { children: [_jsx("span", { className: "sac-eyebrow", children: "SHARED_AGENT_CHAT" }), _jsx("h2", { children: title }), subtitle ? _jsx("p", { children: subtitle }) : null] }), _jsx("div", { className: "sac-toolbar", children: toolbar })] }), contextRail ? _jsx("div", { className: "sac-context-rail", children: contextRail }) : null, hasArtifactStage ? (_jsxs("div", { className: "sac-workspace-with-stage", children: [chatStage, _jsx("div", { className: "sac-artifact-column", children: renderArtifactStage
                            ? renderArtifactStage(slotProps)
                            : _jsx(DefaultArtifactStage, { ...slotProps, label: artifactStageLabel }) })] })) : (chatStage), renderFullscreenSurfaces && fullscreenSurfaces.length > 0
                ? renderFullscreenSurfaces(surfaceSlotProps(fullscreenSurfaces, surfaceRegistry, onSurfaceAction))
                : null, _jsxs("div", { className: "sac-input-rail", children: [_jsx(PendingInteractions, { interactions: interactions, onResolve: onResolveInteraction }), composer ?? (_jsx(ChatComposer, { onSubmit: onSubmit, ariaLabel: composerAriaLabel, ...(composerPlaceholder ? { placeholder: composerPlaceholder } : {}), busy: busy }))] })] }));
}
//# sourceMappingURL=AgentChatShell.js.map