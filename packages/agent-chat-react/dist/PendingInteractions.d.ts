import type { JsonValue, PendingInteraction } from "simplia-agent-chat/core";
export interface PendingInteractionsProps {
    interactions: PendingInteraction[];
    onResolve: (interaction: PendingInteraction, resolution: JsonValue) => void | Promise<void>;
}
export declare function isAffirmativeDecision(decision: string): boolean;
export interface InteractionResolutionState {
    readonly inFlight: boolean;
    readonly confirmation: string | undefined;
}
export declare function createInteractionResolutionState(): InteractionResolutionState;
export declare function selectApprovalDecision(state: InteractionResolutionState, decision: string): InteractionResolutionState;
export declare function cancelApprovalConfirmation(state: InteractionResolutionState): InteractionResolutionState;
export declare function beginInteractionResolution(state: InteractionResolutionState): {
    readonly accepted: boolean;
    readonly state: InteractionResolutionState;
};
export declare function unlockInteractionResolution(state: InteractionResolutionState): InteractionResolutionState;
export declare function PendingInteractions({ interactions, onResolve }: PendingInteractionsProps): import("react").JSX.Element | null;
//# sourceMappingURL=PendingInteractions.d.ts.map