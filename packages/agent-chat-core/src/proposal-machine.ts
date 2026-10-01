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

export const PROPOSAL_STATES = [
  "proposed",
  "modified",
  "accepted",
  "discarded",
  "expired",
  "applied",
  "reverted",
] as const satisfies readonly ProposalState[];

export const TERMINAL_PROPOSAL_STATES = [
  "modified",
  "discarded",
  "expired",
  "reverted",
] as const satisfies readonly ProposalState[];

export type ProposalAction =
  | "modify"
  | "accept"
  | "discard"
  | "expire"
  | "apply"
  | "revert";

export class InvalidTransitionError extends Error {
  readonly code = "invalid_transition";

  constructor(
    readonly from: ProposalState,
    readonly action: ProposalAction,
  ) {
    super(`proposal ${action} is not allowed from state ${from}`);
    this.name = "InvalidTransitionError";
  }
}

export class UndoWindowExpiredError extends Error {
  readonly code = "undo_window_expired";

  constructor(
    readonly changeId: string,
    readonly windowS: number,
  ) {
    super(`undo window (${windowS}s) expired for change ${changeId}`);
    this.name = "UndoWindowExpiredError";
  }
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

function tableAllows(state: ProposalState, action: ProposalAction): boolean {
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
export function canTransition(state: ProposalState, action: ProposalAction): boolean {
  return tableAllows(state, action);
}

export function isTerminalProposalState(state: ProposalState): boolean {
  return (TERMINAL_PROPOSAL_STATES as readonly string[]).includes(state);
}

/**
 * Aplica una acción a una propuesta. Devuelve el nuevo estado y los efectos;
 * lanza InvalidTransitionError para cualquier transición no listada en §3.
 */
export function transitionProposal(
  proposal: ProposalLike,
  action: Exclude<ProposalAction, "revert">,
  ctx?: TransitionContext,
): TransitionResult;
export function transitionProposal(
  proposal: ProposalLike,
  action: "revert",
  ctx: RevertContext,
): TransitionResult;
export function transitionProposal(
  proposal: ProposalLike,
  action: ProposalAction,
  ctx: TransitionContext = { now: new Date() },
): TransitionResult {
  const from = proposal.state;
  if (!tableAllows(from, action)) throw new InvalidTransitionError(from, action);

  switch (action) {
    case "modify":
      return { nextState: "discarded", ...(ctx.supersededBy ? { supersededBy: ctx.supersededBy } : {}) };
    case "accept":
      return { nextState: "accepted" };
    case "discard":
      if (from === "accepted" && !ctx.inGrace) throw new InvalidTransitionError(from, action);
      return { nextState: "discarded" };
    case "expire":
      return { nextState: "expired" };
    case "apply":
      return { nextState: "applied", ...(ctx.changeId ? { changeId: ctx.changeId } : {}) };
    case "revert": {
      const revertCtx = ctx as RevertContext;
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
export function transitionByModify(
  proposal: ProposalLike,
  supersededBy: string,
  ctx?: TransitionContext,
): TransitionResult {
  return transitionProposal(proposal, "modify", { now: new Date(), ...ctx, supersededBy });
}
