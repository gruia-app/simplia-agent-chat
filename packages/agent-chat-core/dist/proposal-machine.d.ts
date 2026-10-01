import type { Proposal } from "@simplia/agent-chat-contract";
/**
 * SPEC-CHAT-F1-R687 rev 2 §3 (normativo): máquina de estados de Proposal.
 *
 * Transiciones permitidas (cualquier otra → InvalidTransitionError, que el
 * servidor expone como 409):
 *   proposed  → modified | accepted | discarded | expired
 *   accepted  → applied | expired | discarded (solo durante la gracia)
 *   applied   → reverted (solo dentro de undo.window_s)
 *   discarded | expired | reverted | modified → terminales
 *
 * `modified` se alcanza solo como marcador: modificar crea una propuesta
 * nueva con `supersedes` y la anterior pasa a `discarded`.
 */
export type ProposalState = NonNullable<Proposal["state"]>;
export declare const PROPOSAL_STATES: readonly ["proposed", "modified", "accepted", "discarded", "expired", "applied", "reverted"];
export declare const TERMINAL_PROPOSAL_STATES: readonly ["modified", "discarded", "expired", "reverted"];
export type ProposalAction = "modify" | "accept" | "discard" | "expire" | "apply" | "revert";
export declare class InvalidTransitionError extends Error {
    readonly from: ProposalState;
    readonly action: ProposalAction;
    readonly code = "invalid_transition";
    constructor(from: ProposalState, action: ProposalAction);
}
export declare class UndoWindowExpiredError extends Error {
    readonly changeId: string;
    readonly windowS: number;
    readonly code = "undo_window_expired";
    constructor(changeId: string, windowS: number);
}
export interface TransitionContext {
    /** Instante actual para chequeos de ventana. */
    now: Date;
    /** true si la propuesta accepted está dentro del periodo de gracia (§4). */
    inGrace?: boolean;
    /** change_id emitido por el servidor en apply. */
    changeId?: string;
    /** Id de la propuesta nueva creada por modify (supersedes). */
    supersededBy?: string;
}
export interface RevertContext extends TransitionContext {
    /** applied_at del ChangeRecord (fuente de la ventana, no del Proposal). */
    changeAppliedAt: Date;
    /** undo.window_s de la ToolSpec. */
    undoWindowS: number;
}
export interface TransitionResult {
    nextState: ProposalState;
    /** Presente cuando la acción fue `apply`. */
    changeId?: string;
    /** Presente cuando la acción fue `modify`: la anterior queda descartada. */
    supersededBy?: string;
}
type ProposalLike = Pick<Proposal, "id" | "state">;
/** Tabla pura de §3 sin contexto: true si la acción puede salir del estado. */
export declare function canTransition(state: ProposalState, action: ProposalAction): boolean;
export declare function isTerminalProposalState(state: ProposalState): boolean;
/**
 * Aplica una acción a una propuesta. Devuelve el nuevo estado y los efectos;
 * lanza InvalidTransitionError para cualquier transición no listada en §3.
 */
export declare function transitionProposal(proposal: ProposalLike, action: Exclude<ProposalAction, "revert">, ctx?: TransitionContext): TransitionResult;
export declare function transitionProposal(proposal: ProposalLike, action: "revert", ctx: RevertContext): TransitionResult;
/**
 * Semántica completa de §3 para `modified`: la propuesta origen pasa a
 * `discarded` y la nueva (state `proposed`) la referencia en `supersedes`.
 * No crea el documento nuevo — el servidor lo persiste; aquí solo se fija
 * la transición del registro existente.
 */
export declare function transitionByModify(proposal: ProposalLike, supersededBy: string, ctx?: TransitionContext): TransitionResult;
export {};
//# sourceMappingURL=proposal-machine.d.ts.map