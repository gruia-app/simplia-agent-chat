export const PROPOSAL_STATES = [
    "proposed",
    "modified",
    "accepted",
    "discarded",
    "expired",
    "applied",
    "reverted",
];
export const TERMINAL_PROPOSAL_STATES = [
    "modified",
    "discarded",
    "expired",
    "reverted",
];
export class InvalidTransitionError extends Error {
    from;
    action;
    code = "invalid_transition";
    constructor(from, action) {
        super(`proposal ${action} is not allowed from state ${from}`);
        this.from = from;
        this.action = action;
        this.name = "InvalidTransitionError";
    }
}
export class UndoWindowExpiredError extends Error {
    changeId;
    windowS;
    code = "undo_window_expired";
    constructor(changeId, windowS) {
        super(`undo window (${windowS}s) expired for change ${changeId}`);
        this.changeId = changeId;
        this.windowS = windowS;
        this.name = "UndoWindowExpiredError";
    }
}
function tableAllows(state, action) {
    switch (state) {
        case "proposed":
            return action === "modify" || action === "accept" || action === "discard" || action === "expire";
        case "accepted":
            return action === "apply" || action === "expire" || action === "discard";
        case "applied":
            return action === "revert";
        default:
            return false;
    }
}
/** Tabla pura de §3 sin contexto: true si la acción puede salir del estado. */
export function canTransition(state, action) {
    return tableAllows(state, action);
}
export function isTerminalProposalState(state) {
    return TERMINAL_PROPOSAL_STATES.includes(state);
}
export function transitionProposal(proposal, action, ctx = { now: new Date() }) {
    const from = proposal.state;
    if (!tableAllows(from, action))
        throw new InvalidTransitionError(from, action);
    switch (action) {
        case "modify":
            return { nextState: "discarded", ...(ctx.supersededBy ? { supersededBy: ctx.supersededBy } : {}) };
        case "accept":
            return { nextState: "accepted" };
        case "discard":
            if (from === "accepted" && !ctx.inGrace)
                throw new InvalidTransitionError(from, action);
            return { nextState: "discarded" };
        case "expire":
            return { nextState: "expired" };
        case "apply":
            return { nextState: "applied", ...(ctx.changeId ? { changeId: ctx.changeId } : {}) };
        case "revert": {
            const revertCtx = ctx;
            const deadline = new Date(revertCtx.changeAppliedAt.getTime() + revertCtx.undoWindowS * 1000);
            if (ctx.now.getTime() > deadline.getTime()) {
                throw new UndoWindowExpiredError(revertCtx.changeId ?? proposal.id, revertCtx.undoWindowS);
            }
            return { nextState: "reverted" };
        }
    }
}
/**
 * Semántica completa de §3 para `modified`: la propuesta origen pasa a
 * `discarded` y la nueva (state `proposed`) la referencia en `supersedes`.
 * No crea el documento nuevo — el servidor lo persiste; aquí solo se fija
 * la transición del registro existente.
 */
export function transitionByModify(proposal, supersededBy, ctx) {
    return transitionProposal(proposal, "modify", { now: new Date(), ...ctx, supersededBy });
}
//# sourceMappingURL=proposal-machine.js.map