"use client";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from "react";
import { resolveAgentChatCopy, sacThemeAttributes, } from "./copy.js";
const AFFIRMATIVE_DECISIONS = new Set([
    "accept",
    "allow",
    "approve",
    "approved",
    "confirm",
    "yes",
]);
export function isAffirmativeDecision(decision) {
    return AFFIRMATIVE_DECISIONS.has(decision.trim().toLowerCase());
}
export function createInteractionResolutionState() {
    return { inFlight: false, confirmation: undefined };
}
export function selectApprovalDecision(state, decision) {
    if (state.inFlight || state.confirmation !== undefined)
        return state;
    return { ...state, confirmation: decision };
}
export function cancelApprovalConfirmation(state) {
    if (state.inFlight)
        return state;
    return { ...state, confirmation: undefined };
}
export function beginInteractionResolution(state) {
    if (state.inFlight)
        return { accepted: false, state };
    return { accepted: true, state: { ...state, inFlight: true } };
}
export function unlockInteractionResolution(state) {
    return { ...state, inFlight: false };
}
function InteractionCard({ interaction, onResolve, copy, }) {
    const [answer, setAnswer] = useState("");
    const [resolution, setResolution] = useState(createInteractionResolutionState);
    const [resolutionError, setResolutionError] = useState();
    const resolutionRef = useRef(resolution);
    const confirmButtonRef = useRef(null);
    const titleId = `sac-interaction-${interaction.id}`;
    const decisions = interaction.availableDecisions ??
        (interaction.kind === "approval" ? ["approve", "deny"] : []);
    const requiresConfirmation = interaction.kind === "approval";
    const submitResolution = (value) => {
        const attempt = beginInteractionResolution(resolutionRef.current);
        if (!attempt.accepted)
            return;
        resolutionRef.current = attempt.state;
        setResolution(attempt.state);
        setResolutionError(undefined);
        void Promise.resolve()
            .then(() => onResolve(interaction, value))
            .catch(() => {
            const unlocked = unlockInteractionResolution(resolutionRef.current);
            resolutionRef.current = unlocked;
            setResolution(unlocked);
            setResolutionError(copy.resolutionError);
        });
    };
    const submitAnswer = (event) => {
        event.preventDefault();
        const value = answer.trim();
        if (!value)
            return;
        submitResolution({ answer: value });
    };
    const chooseDecision = (decision) => {
        if (resolutionRef.current.inFlight)
            return;
        if (requiresConfirmation) {
            const next = selectApprovalDecision(resolutionRef.current, decision);
            resolutionRef.current = next;
            setResolution(next);
            return;
        }
        submitResolution({ decision });
    };
    const confirmation = resolution.confirmation;
    useEffect(() => {
        if (confirmation !== undefined && !resolution.inFlight) {
            confirmButtonRef.current?.focus();
        }
    }, [confirmation, resolution.inFlight]);
    return (_jsxs("section", { className: `sac-interaction sac-interaction-${interaction.kind}`, "aria-labelledby": titleId, ...(resolution.inFlight ? { "aria-busy": true } : {}), children: [_jsxs("div", { className: "sac-interaction-copy", children: [_jsx("span", { className: "sac-eyebrow", children: interaction.kind === "approval" ? copy.approvalRequiredLabel : copy.inputRequiredLabel }), _jsx("h3", { id: titleId, children: interaction.title }), interaction.description ? _jsx("p", { children: interaction.description }) : null, requiresConfirmation ? (_jsx("p", { className: "sac-interaction-confirm-hint", children: copy.confirmationRequiredHint })) : null] }), decisions.length > 0 ? (confirmation !== undefined ? (_jsxs("div", { className: "sac-interaction-actions sac-interaction-confirm", role: "group", "aria-label": copy.confirmDecisionAriaLabel(confirmation, interaction.title), children: [_jsxs("p", { className: "sac-interaction-confirm-choice", children: [copy.confirmChoicePrefix, " ", _jsx("strong", { children: copy.decisionLabel(confirmation) })] }), _jsx("button", { className: `sac-button${isAffirmativeDecision(confirmation) ? " sac-button-primary" : ""}`, type: "button", disabled: resolution.inFlight, "aria-label": copy.confirmDecisionAriaLabel(confirmation, interaction.title), ref: confirmButtonRef, onClick: () => submitResolution({ decision: confirmation }), children: copy.confirmDecisionLabel(confirmation) }), _jsx("button", { className: "sac-button", type: "button", disabled: resolution.inFlight, "aria-label": copy.backAriaLabel(interaction.title), onClick: () => {
                            const next = cancelApprovalConfirmation(resolutionRef.current);
                            resolutionRef.current = next;
                            setResolution(next);
                        }, children: copy.backLabel })] })) : (_jsx("div", { className: "sac-interaction-actions", role: "group", "aria-label": copy.respondAriaLabel(interaction.title), children: decisions.map((decision) => (_jsx("button", { className: `sac-button${isAffirmativeDecision(decision) ? " sac-button-primary" : ""}`, type: "button", disabled: resolution.inFlight, onClick: () => chooseDecision(decision), children: copy.decisionLabel(decision) }, decision))) }))) : (_jsxs("form", { className: "sac-answer-form", onSubmit: submitAnswer, children: [_jsx("label", { htmlFor: `${titleId}-answer`, children: copy.answerLabel(interaction.title) }), _jsxs("div", { children: [_jsx("input", { id: `${titleId}-answer`, value: answer, onChange: (event) => setAnswer(event.target.value), autoComplete: "off", disabled: resolution.inFlight }), _jsx("button", { className: "sac-button sac-button-primary", type: "submit", disabled: resolution.inFlight || !answer.trim(), children: copy.submitAnswerLabel })] })] })), resolutionError ? _jsx("p", { className: "sac-interaction-error", role: "alert", children: resolutionError }) : null] }));
}
export function PendingInteractions({ interactions, onResolve, copy, theme }) {
    const resolved = resolveAgentChatCopy(copy);
    const pending = interactions.filter((interaction) => interaction.status === "pending");
    if (pending.length === 0)
        return null;
    return (_jsx("div", { className: "sac-interactions sac-theme", "aria-label": resolved.pendingInteractionsLabel, ...sacThemeAttributes(theme), children: pending.map((interaction) => (_jsx(InteractionCard, { interaction: interaction, onResolve: onResolve, copy: resolved }, interaction.id))) }));
}
//# sourceMappingURL=PendingInteractions.js.map