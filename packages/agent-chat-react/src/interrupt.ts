import { isTerminalTurnStatus, type ChatTurn } from "simplia-agent-chat/core";

export type InterruptRequestStatus = "idle" | "submitting" | "submitted" | "failed";

export interface InterruptRequestState {
  readonly status: InterruptRequestStatus;
  readonly turnId?: string;
}

export function createInterruptRequestState(): InterruptRequestState {
  return { status: "idle" };
}

export function beginInterruptRequest(
  state: InterruptRequestState,
  turnId: string,
): { readonly accepted: boolean; readonly state: InterruptRequestState } {
  if ((state.status === "submitting" || state.status === "submitted") && state.turnId === turnId) {
    return { accepted: false, state };
  }
  return { accepted: true, state: { status: "submitting", turnId } };
}

export function completeInterruptRequest(state: InterruptRequestState): InterruptRequestState {
  if (state.status !== "submitting") return state;
  return { ...state, status: "submitted" };
}

export function failInterruptRequest(state: InterruptRequestState): InterruptRequestState {
  if (state.status !== "submitting") return state;
  return { ...state, status: "failed" };
}

export function resetInterruptRequest(state: InterruptRequestState): InterruptRequestState {
  if (state.status === "idle" && state.turnId === undefined) return state;
  return createInterruptRequestState();
}

export function reconcileInterruptRequest(
  state: InterruptRequestState,
  turn: ChatTurn | undefined,
): InterruptRequestState {
  if (!turn || isTerminalTurnStatus(turn.status) || (state.turnId !== undefined && state.turnId !== turn.id)) {
    return resetInterruptRequest(state);
  }
  return state;
}
