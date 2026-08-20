"use client";
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useId, useRef, useState } from "react";
import { isTerminalTurnStatus, } from "simplia-agent-chat/core";
import { resolveAgentChatCopy, sacThemeAttributes, } from "./copy.js";
import { beginInterruptRequest, completeInterruptRequest, createInterruptRequestState, failInterruptRequest, reconcileInterruptRequest, } from "./interrupt.js";
export function ChatRunStatus({ runState, onInterrupt, copy, theme }) {
    const resolved = resolveAgentChatCopy(copy);
    const [request, setRequest] = useState(createInterruptRequestState);
    const [interruptError, setInterruptError] = useState();
    const interruptDescriptionId = useId();
    const requestRef = useRef(request);
    const activeTurn = runState.turn && !isTerminalTurnStatus(runState.turn.status) ? runState.turn : undefined;
    const activeTurnRef = useRef(activeTurn);
    activeTurnRef.current = activeTurn;
    useEffect(() => {
        const next = reconcileInterruptRequest(requestRef.current, activeTurn);
        if (next === requestRef.current)
            return;
        requestRef.current = next;
        setRequest(next);
        setInterruptError(undefined);
    }, [activeTurn]);
    const showStop = Boolean(activeTurn && onInterrupt);
    const interruptLocked = request.status === "submitting" || request.status === "submitted";
    const interruptLabel = request.status === "submitting"
        ? resolved.interruptBusyLabel
        : request.status === "submitted"
            ? resolved.interruptRequestedLabel
            : resolved.interruptLabel;
    const interruptAnnouncement = request.status === "submitting" || request.status === "submitted"
        ? interruptLabel
        : undefined;
    const requestStop = () => {
        if (!activeTurn || !onInterrupt)
            return;
        const attempt = beginInterruptRequest(requestRef.current, activeTurn.id);
        if (!attempt.accepted)
            return;
        requestRef.current = attempt.state;
        setRequest(attempt.state);
        setInterruptError(undefined);
        const requestedTurnId = activeTurn.id;
        const isCurrentRequest = () => (activeTurnRef.current?.id === requestedTurnId
            && requestRef.current.turnId === requestedTurnId
            && requestRef.current.status === "submitting");
        void Promise.resolve()
            .then(() => onInterrupt(activeTurn))
            .then(() => {
            if (!isCurrentRequest())
                return;
            const completed = completeInterruptRequest(requestRef.current);
            requestRef.current = completed;
            setRequest(completed);
        })
            .catch(() => {
            if (!isCurrentRequest())
                return;
            const failed = failInterruptRequest(requestRef.current);
            requestRef.current = failed;
            setRequest(failed);
            setInterruptError(resolved.interruptError);
        });
    };
    return (_jsxs("div", { className: "sac-run-status sac-theme", "data-sac-run-phase": runState.phase, "data-sac-interrupt-status": request.status, ...sacThemeAttributes(theme), children: [_jsxs("div", { className: "sac-run-status-copy", role: "status", "aria-live": "polite", "aria-atomic": "true", children: [_jsx("span", { className: `sac-status sac-status-${runState.phase}`, children: resolved.runPhaseLabel(runState.phase) }), runState.waitingKind === "approval" ? (_jsx("span", { className: "sac-run-status-kind", children: resolved.approvalRequiredLabel })) : runState.waitingKind === "input" ? (_jsx("span", { className: "sac-run-status-kind", children: resolved.inputRequiredLabel })) : null, interruptAnnouncement ? _jsx("span", { className: "sac-sr-only", children: interruptAnnouncement }) : null] }), showStop ? (_jsxs(_Fragment, { children: [_jsx("button", { className: "sac-button sac-run-status-stop", type: "button", disabled: interruptLocked, "aria-busy": request.status === "submitting", "aria-describedby": interruptDescriptionId, onClick: requestStop, children: interruptLabel }), _jsx("span", { className: "sac-sr-only", id: interruptDescriptionId, children: resolved.interruptDescription })] })) : null, interruptError ? _jsx("p", { className: "sac-run-status-error", role: "alert", children: interruptError }) : null] }));
}
//# sourceMappingURL=ChatRunStatus.js.map