"use client";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo } from "react";
import { selectThreadSurfaces, selectThreadTurns, selectTurnItems, } from "simplia-agent-chat/core";
import { resolveAgentChatCopy, sacThemeAttributes, } from "./copy.js";
import { SurfaceHost } from "./surface-registry.js";
function stringifyDetail(value) {
    if (value === undefined || value === null)
        return null;
    if (typeof value === "string")
        return value;
    return JSON.stringify(value, null, 2);
}
function ItemRow({ item, renderMessage, copy, }) {
    const text = item.text?.trim();
    const detail = stringifyDetail(item.output ?? item.input);
    const label = item.role === "user" ? copy.userLabel : item.title ?? item.toolName ?? item.kind;
    const statusLabel = copy.itemStatusLabel(item.status);
    const messageLike = item.kind === "message" || item.kind === "reasoning" || item.kind === "system";
    return (_jsxs("article", { className: `sac-item sac-item-${item.role ?? item.kind}`, "aria-label": copy.itemAriaLabel(label, item.status), children: [_jsxs("div", { className: "sac-item-meta", children: [_jsx("span", { children: label }), _jsx("span", { className: `sac-status sac-status-${item.status}`, children: statusLabel })] }), text ? (_jsx("div", { className: messageLike ? "sac-message-text" : "sac-work-title", children: messageLike && renderMessage ? renderMessage(item) : text })) : null, !messageLike && detail ? (_jsxs("details", { className: "sac-work-detail", children: [_jsx("summary", { children: copy.inspectDetails }), _jsx("pre", { children: detail })] })) : null] }));
}
export function ChatTimeline({ state, threadId, surfaceRegistry, onSurfaceAction, emptyLabel, renderMessage, copy, theme, }) {
    const resolved = resolveAgentChatCopy(copy);
    const emptyText = emptyLabel ?? resolved.emptyLabel;
    const turns = useMemo(() => selectThreadTurns(state, threadId), [state, threadId]);
    const surfacesByTurn = useMemo(() => {
        const next = new Map();
        for (const surface of selectThreadSurfaces(state, threadId, "inline")) {
            const key = surface.turnId ?? "thread";
            next.set(key, [...(next.get(key) ?? []), surface]);
        }
        return next;
    }, [state, threadId]);
    if (turns.length === 0 && (surfacesByTurn.get("thread")?.length ?? 0) === 0) {
        return (_jsx("div", { className: "sac-empty sac-theme", ...sacThemeAttributes(theme), children: emptyText }));
    }
    return (_jsxs("div", { className: "sac-timeline sac-theme", role: "log", "aria-live": "off", "aria-relevant": "additions text", "aria-atomic": "false", "aria-label": resolved.conversationActivityLabel, ...sacThemeAttributes(theme), children: [(surfacesByTurn.get("thread") ?? []).map((surface) => (_jsx(SurfaceHost, { block: surface, registry: surfaceRegistry, copy: resolved, ...(theme ? { theme } : {}), ...(onSurfaceAction ? { onAction: onSurfaceAction } : {}) }, surface.id))), turns.map((turn) => (_jsxs("section", { className: "sac-turn", "aria-label": resolved.turnAriaLabel(turn.status), children: [selectTurnItems(state, turn.id).map((item) => (_jsx(ItemRow, { item: item, copy: resolved, ...(renderMessage ? { renderMessage } : {}) }, item.id))), (surfacesByTurn.get(turn.id) ?? []).map((surface) => (_jsx(SurfaceHost, { block: surface, registry: surfaceRegistry, copy: resolved, ...(theme ? { theme } : {}), ...(onSurfaceAction ? { onAction: onSurfaceAction } : {}) }, surface.id)))] }, turn.id)))] }));
}
//# sourceMappingURL=ChatTimeline.js.map