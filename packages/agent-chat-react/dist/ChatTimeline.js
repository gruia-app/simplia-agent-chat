"use client";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo } from "react";
import { selectThreadTurns, selectTurnItems, } from "simplia-agent-chat/core";
import { SurfaceHost } from "./surface-registry.js";
function stringifyDetail(value) {
    if (value === undefined || value === null)
        return null;
    if (typeof value === "string")
        return value;
    return JSON.stringify(value, null, 2);
}
function ItemRow({ item }) {
    const text = item.text?.trim();
    const detail = stringifyDetail(item.output ?? item.input);
    const label = item.role === "user" ? "You" : item.title ?? item.toolName ?? item.kind;
    const messageLike = item.kind === "message" || item.kind === "reasoning" || item.kind === "system";
    return (_jsxs("article", { className: `sac-item sac-item-${item.role ?? item.kind}`, "aria-label": `${label}, ${item.status}`, children: [_jsxs("div", { className: "sac-item-meta", children: [_jsx("span", { children: label }), _jsx("span", { className: `sac-status sac-status-${item.status}`, children: item.status })] }), text ? _jsx("p", { className: messageLike ? "sac-message-text" : "sac-work-title", children: text }) : null, !messageLike && detail ? (_jsxs("details", { className: "sac-work-detail", children: [_jsx("summary", { children: "Inspect details" }), _jsx("pre", { children: detail })] })) : null] }));
}
export function ChatTimeline({ state, threadId, surfaceRegistry, onSurfaceAction, emptyLabel = "No messages yet. Send a precise instruction to begin.", }) {
    const turns = useMemo(() => selectThreadTurns(state, threadId), [state, threadId]);
    const surfacesByTurn = useMemo(() => {
        const next = new Map();
        for (const surface of Object.values(state.surfaces)) {
            if (surface.threadId !== threadId)
                continue;
            const key = surface.turnId ?? "thread";
            next.set(key, [...(next.get(key) ?? []), surface]);
        }
        return next;
    }, [state.surfaces, threadId]);
    if (turns.length === 0 && (surfacesByTurn.get("thread")?.length ?? 0) === 0) {
        return _jsx("div", { className: "sac-empty", children: emptyLabel });
    }
    return (_jsxs("div", { className: "sac-timeline", role: "log", "aria-live": "off", "aria-relevant": "additions text", "aria-atomic": "false", "aria-label": "Conversation activity", children: [(surfacesByTurn.get("thread") ?? []).map((surface) => (_jsx(SurfaceHost, { block: surface, registry: surfaceRegistry, ...(onSurfaceAction ? { onAction: onSurfaceAction } : {}) }, surface.id))), turns.map((turn) => (_jsxs("section", { className: "sac-turn", "aria-label": `Turn ${turn.status}`, children: [selectTurnItems(state, turn.id).map((item) => (_jsx(ItemRow, { item: item }, item.id))), (surfacesByTurn.get(turn.id) ?? []).map((surface) => (_jsx(SurfaceHost, { block: surface, registry: surfaceRegistry, ...(onSurfaceAction ? { onAction: onSurfaceAction } : {}) }, surface.id)))] }, turn.id)))] }));
}
//# sourceMappingURL=ChatTimeline.js.map