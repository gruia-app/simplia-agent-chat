"use client";
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useId, useRef, useState } from "react";
import { activeMemoryEntries, canTransition, } from "simplia-agent-chat/core";
function useUndoWindow(deadline, now) {
    const [tick, setTick] = useState(0);
    useEffect(() => {
        if (now || !Number.isFinite(deadline))
            return;
        const remaining = deadline - Date.now();
        if (remaining <= 0)
            return;
        const timer = setTimeout(() => setTick((value) => value + 1), Math.min(remaining, 2_147_483_647));
        return () => clearTimeout(timer);
    }, [deadline, now, tick]);
    return Number.isFinite(deadline) && deadline > (now?.getTime() ?? Date.now());
}
/** Messages remain ordinary text; streamed fragments are only announced once complete. */
export function ChatLog({ items, label = "Conversación" }) {
    return (_jsx("div", { className: "sac-f1-log", role: "log", "aria-live": "polite", "aria-relevant": "additions", "aria-label": label, children: items.filter((item) => item.kind === "message" && item.text).map((item) => (_jsxs("div", { className: "sac-f1-message", "aria-hidden": item.status === "streaming" ? true : undefined, children: [_jsx("strong", { children: item.role === "user" ? "Tú" : "Asistente" }), _jsx("p", { children: item.text })] }, `${item.id}:${item.status === "streaming" ? "stream" : "final"}`))) }));
}
function DisplayValue({ value }) {
    if (value === undefined)
        return _jsx("span", { children: "\u2205" });
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean")
        return _jsx("span", { children: String(value) });
    return _jsx("span", { children: "Dato estructurado" });
}
/** Only the trusted StructuredDiff model is rendered, never Proposal.preview. */
export function ProposalDiff({ diff }) {
    if (diff.kind === "text")
        return _jsx("div", { className: "sac-f1-diff", children: diff.hunks.map((hunk, index) => (_jsxs("div", { children: [_jsx("strong", { children: hunk.path }), _jsx("del", { children: hunk.before }), _jsx("ins", { children: hunk.after })] }, `${hunk.path}:${index}`))) });
    if (diff.kind === "fields")
        return _jsx("div", { className: "sac-f1-diff", children: diff.changes.map((change, index) => (_jsxs("div", { children: [_jsx("strong", { children: change.path }), change.op !== "add" && _jsx("del", { children: _jsx(DisplayValue, { value: change.before }) }), change.op !== "remove" && _jsx("ins", { children: _jsx(DisplayValue, { value: change.after }) })] }, `${change.path}:${index}`))) });
    return _jsx("div", { className: "sac-f1-diff", children: diff.changes.map((change, index) => (_jsxs("div", { children: [_jsxs("strong", { children: [change.table, ": ", change.key] }), change.op !== "add" && _jsx("del", { children: "Fila anterior" }), change.op !== "remove" && _jsx("ins", { children: "Fila nueva" })] }, `${change.table}:${change.key}:${index}`))) });
}
export function ProposalCard({ proposal, title, effect, diff, costLabel, undoUntil, now, onAccept, onModify, onDiscard, onUndo }) {
    const headingId = useId();
    const actionable = canTransition(proposal.state, "accept");
    const withinUndoWindow = useUndoWindow(undoUntil ? Date.parse(undoUntil) : NaN, now);
    const canUndo = proposal.state === "applied" && !!proposal.change_id && withinUndoWindow;
    return _jsxs("article", { className: "sac-f1-card", "aria-labelledby": headingId, children: [_jsx("h3", { id: headingId, children: title ?? proposal.tool }), _jsxs("div", { className: "sac-f1-meta", children: [effect && _jsx("span", { className: "sac-f1-chip", children: effect === "reversible" ? "Reversible" : "Irreversible" }), costLabel && _jsx("span", { className: "sac-f1-chip", children: costLabel }), proposal.confirm_effective !== "none" && _jsx("span", { className: "sac-f1-chip", children: "Pide confirmaci\u00F3n" })] }), diff && _jsx(ProposalDiff, { diff: diff }), actionable && _jsxs("div", { className: "sac-f1-actions", children: [onAccept && _jsx("button", { type: "button", className: "sac-button sac-button-primary", onClick: () => onAccept(proposal), children: "Aceptar" }), onModify && _jsx("button", { type: "button", className: "sac-button", onClick: () => onModify(proposal), children: "Modificar" }), onDiscard && _jsx("button", { type: "button", className: "sac-button", onClick: () => onDiscard(proposal), children: "Descartar" })] }), canUndo && onUndo && _jsx("button", { type: "button", className: "sac-button", onClick: () => onUndo(proposal), children: "Deshacer" })] });
}
export function IrreversibleDialog({ open, title, description, onConfirm, onCancel, confirmLabel = "Confirmar acción irreversible" }) {
    const headingId = useId();
    const descriptionId = useId();
    const dialogRef = useRef(null);
    const checkRef = useRef(null);
    const previousFocus = useRef(null);
    const [acknowledged, setAcknowledged] = useState(false);
    useEffect(() => {
        if (!open)
            return;
        previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        setAcknowledged(false);
        checkRef.current?.focus();
        return () => previousFocus.current?.focus();
    }, [open]);
    if (!open)
        return null;
    function onKeyDown(event) {
        if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
            return;
        }
        if (event.key !== "Tab")
            return;
        const controls = Array.from(dialogRef.current?.querySelectorAll('input:not(:disabled), button:not(:disabled)') ?? []);
        const first = controls[0];
        const last = controls.at(-1);
        if (!first || !last)
            return;
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        }
        else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    }
    return _jsx("div", { className: "sac-f1-dialog-backdrop", children: _jsxs("div", { ref: dialogRef, role: "alertdialog", "aria-modal": "true", "aria-labelledby": headingId, "aria-describedby": descriptionId, className: "sac-f1-dialog", onKeyDown: onKeyDown, children: [_jsx("h2", { id: headingId, children: title }), _jsx("p", { id: descriptionId, children: description }), _jsxs("label", { children: [_jsx("input", { ref: checkRef, type: "checkbox", checked: acknowledged, onChange: (event) => setAcknowledged(event.target.checked) }), " Entiendo que esta acci\u00F3n puede ser irreversible"] }), _jsxs("div", { className: "sac-f1-actions", children: [_jsx("button", { className: "sac-button", type: "button", onClick: onCancel, children: "Cancelar" }), _jsx("button", { className: "sac-button sac-button-primary", type: "button", disabled: !acknowledged, onClick: onConfirm, children: confirmLabel })] })] }) });
}
export function UndoToast({ change, onUndo, now, message = "Cambio aplicado" }) {
    const until = Date.parse(change.applied_at) + change.undo_window_s * 1000;
    const withinUndoWindow = useUndoWindow(until, now);
    if (change.undo_mode === "none" || !withinUndoWindow)
        return null;
    return _jsxs("div", { className: "sac-f1-toast", role: "status", children: [message, " ", _jsx("button", { className: "sac-button", type: "button", onClick: () => onUndo(change.change_id), children: "Deshacer" })] });
}
export function PlanSteps({ steps, onAcceptStep }) {
    return _jsx("ol", { className: "sac-f1-steps", "aria-label": "Pasos del plan", children: steps.map((step) => _jsxs("li", { "aria-current": step.status === "current" ? "step" : undefined, children: [step.label, " ", _jsx("span", { children: step.status === "completed" ? "Completado" : step.status === "failed" ? "Error" : step.status === "current" ? "En curso" : "Pendiente" }), step.proposal && onAcceptStep && canTransition(step.proposal.state, "accept") && _jsxs("button", { className: "sac-button", type: "button", onClick: () => onAcceptStep(step, step.proposal), children: ["Aceptar paso: ", step.label] })] }, step.id)) });
}
export function MemoryPanel({ state, title = "Memoria" }) {
    return _jsxs("section", { className: "sac-f1-panel", "aria-label": title, children: [_jsx("h2", { children: title }), activeMemoryEntries(state).length ? _jsx("ul", { children: activeMemoryEntries(state).map((entry) => _jsx("li", { children: entry.text }, entry.id)) }) : _jsx("p", { children: "Sin recuerdos guardados." })] });
}
export function BYOPanel({ state, title = "Claves propias", actions }) {
    return _jsxs("section", { className: "sac-f1-panel", "aria-label": title, children: [_jsx("h2", { children: title }), state.keys.length ? _jsx("ul", { children: state.keys.map((key) => _jsxs("li", { children: [key.provider, ": ", key.status === "active" ? "Activa" : key.status === "revoked" ? "Revocada" : "Ausente", key.keyLast4 && _jsxs(_Fragment, { children: [" \u00B7\u00B7\u00B7\u00B7", key.keyLast4.slice(-4)] })] }, key.provider)) }) : _jsx("p", { children: "Sin claves configuradas." }), actions] });
}
//# sourceMappingURL=ProposalComponents.js.map