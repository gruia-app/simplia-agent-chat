import { type ChatTurn } from "simplia-agent-chat/core";
export type InterruptRequestStatus = "idle" | "submitting" | "submitted" | "failed";
export interface InterruptRequestState {
    readonly status: InterruptRequestStatus;
    readonly turnId?: string;
}
export declare function createInterruptRequestState(): InterruptRequestState;
export declare function beginInterruptRequest(state: InterruptRequestState, turnId: string): {
    readonly accepted: boolean;
    readonly state: InterruptRequestState;
};
export declare function completeInterruptRequest(state: InterruptRequestState): InterruptRequestState;
export declare function failInterruptRequest(state: InterruptRequestState): InterruptRequestState;
export declare function resetInterruptRequest(state: InterruptRequestState): InterruptRequestState;
export declare function reconcileInterruptRequest(state: InterruptRequestState, turn: ChatTurn | undefined): InterruptRequestState;
//# sourceMappingURL=interrupt.d.ts.map