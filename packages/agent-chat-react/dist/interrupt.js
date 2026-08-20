import { isTerminalTurnStatus } from "simplia-agent-chat/core";
export function createInterruptRequestState() {
    return { status: "idle" };
}
export function beginInterruptRequest(state, turnId) {
    if ((state.status === "submitting" || state.status === "submitted") && state.turnId === turnId) {
        return { accepted: false, state };
    }
    return { accepted: true, state: { status: "submitting", turnId } };
}
export function completeInterruptRequest(state) {
    if (state.status !== "submitting")
        return state;
    return { ...state, status: "submitted" };
}
export function failInterruptRequest(state) {
    if (state.status !== "submitting")
        return state;
    return { ...state, status: "failed" };
}
export function resetInterruptRequest(state) {
    if (state.status === "idle" && state.turnId === undefined)
        return state;
    return createInterruptRequestState();
}
export function reconcileInterruptRequest(state, turn) {
    if (!turn || isTerminalTurnStatus(turn.status) || (state.turnId !== undefined && state.turnId !== turn.id)) {
        return resetInterruptRequest(state);
    }
    return state;
}
//# sourceMappingURL=interrupt.js.map