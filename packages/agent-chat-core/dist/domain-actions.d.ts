import { type JsonValue } from "./protocol.js";
import type { SurfaceActionCommand } from "./surfaces.js";
export type SurfaceActionReceiptStatus = "pending" | "confirming" | "succeeded" | "conflicted" | "failed" | "unknown";
export interface SurfaceActionReceipt {
    idempotencyKey: string;
    status: SurfaceActionReceiptStatus;
    receiptId?: string;
    result?: JsonValue;
    error?: {
        code: string;
        message?: string;
        retryable?: boolean;
    };
    updatedAt?: string;
}
export interface SurfaceActionTransportOptions {
    signal?: AbortSignal;
}
export interface AbandonUnknownSurfaceActionOptions extends SurfaceActionTransportOptions {
    acknowledgePossibleEffects: true;
}
/**
 * Provider-neutral transport boundary. Authorization, validation, persistence,
 * and the domain mutation remain server responsibilities.
 */
export interface SurfaceActionTransport {
    execute(command: SurfaceActionCommand, options?: SurfaceActionTransportOptions): Promise<SurfaceActionReceipt>;
    getReceipt(idempotencyKey: string, options?: SurfaceActionTransportOptions): Promise<SurfaceActionReceipt | undefined>;
    abandonUnknown(idempotencyKey: string, options: AbandonUnknownSurfaceActionOptions): Promise<SurfaceActionReceipt>;
}
export type SurfaceActionOperation = "execute" | "reconcile" | "abandon";
export interface SurfaceActionState {
    command?: SurfaceActionCommand;
    receipt?: SurfaceActionReceipt;
    /** Once abandonUnknown is dispatched, execute retry is permanently disabled. */
    abandonedUnknown?: true;
    operation?: {
        id: number;
        kind: SurfaceActionOperation;
        previousReceipt?: SurfaceActionReceipt;
    };
    nextOperationId: number;
}
export interface SurfaceActionTransition {
    state: SurfaceActionState;
    accepted: boolean;
    operationId?: number;
}
export declare function createSurfaceActionState(hydrated?: Pick<SurfaceActionState, "command" | "receipt" | "abandonedUnknown">): SurfaceActionState;
export declare function surfaceActionStatus(state: SurfaceActionState): "idle" | SurfaceActionReceiptStatus;
export declare function isSurfaceActionBusy(state: SurfaceActionState): boolean;
export declare function beginSurfaceAction(state: SurfaceActionState, command: SurfaceActionCommand): SurfaceActionTransition;
export declare function retrySurfaceAction(state: SurfaceActionState): SurfaceActionTransition;
export declare function reconcileSurfaceAction(state: SurfaceActionState): SurfaceActionTransition;
export declare function beginAbandonUnknownSurfaceAction(state: SurfaceActionState, acknowledgePossibleEffects: boolean): SurfaceActionTransition;
export declare function applySurfaceActionReceipt(state: SurfaceActionState, operationId: number, receipt: SurfaceActionReceipt): SurfaceActionState;
/** A dispatched execute with no authoritative receipt is always outcome-unknown. */
export declare function markSurfaceActionUnknown(state: SurfaceActionState, operationId: number): SurfaceActionState;
/** A missing or failed reconciliation preserves unknown, never invents failure. */
export declare function finishSurfaceActionReconciliationUnknown(state: SurfaceActionState, operationId: number): SurfaceActionState;
/** A failed abandon request returns to unknown; it never executes the action. */
export declare function finishSurfaceActionAbandonmentUnknown(state: SurfaceActionState, operationId: number): SurfaceActionState;
//# sourceMappingURL=domain-actions.d.ts.map