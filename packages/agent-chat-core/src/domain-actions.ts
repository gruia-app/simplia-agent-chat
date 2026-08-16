import { isJsonValue, type JsonValue } from "./protocol.js";
import type { SurfaceActionCommand } from "./surfaces.js";

export type SurfaceActionReceiptStatus =
  | "pending"
  | "confirming"
  | "succeeded"
  | "conflicted"
  | "failed"
  | "unknown";

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
  execute(
    command: SurfaceActionCommand,
    options?: SurfaceActionTransportOptions,
  ): Promise<SurfaceActionReceipt>;
  getReceipt(
    idempotencyKey: string,
    options?: SurfaceActionTransportOptions,
  ): Promise<SurfaceActionReceipt | undefined>;
  abandonUnknown(
    idempotencyKey: string,
    options: AbandonUnknownSurfaceActionOptions,
  ): Promise<SurfaceActionReceipt>;
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

const RECEIPT_STATUSES = new Set<SurfaceActionReceiptStatus>([
  "pending",
  "confirming",
  "succeeded",
  "conflicted",
  "failed",
  "unknown",
]);

export function createSurfaceActionState(
  hydrated?: Pick<SurfaceActionState, "command" | "receipt" | "abandonedUnknown">,
): SurfaceActionState {
  if (!hydrated) return { nextOperationId: 1 };
  if (hydrated.receipt && !hydrated.command) {
    throw new Error("surface_action_hydration_command_required");
  }
  if (hydrated.command && !hydrated.receipt) {
    throw new Error("surface_action_hydration_receipt_required");
  }
  if (
    hydrated.command &&
    hydrated.receipt &&
    hydrated.command.idempotencyKey !== hydrated.receipt.idempotencyKey
  ) {
    throw new Error("surface_action_hydration_key_mismatch");
  }
  const command = hydrated.command ? snapshotCommand(hydrated.command) : undefined;
  const receipt = hydrated.receipt ? normalizeReceipt(hydrated.receipt) : undefined;
  const recoveredReceipt = receipt?.status === "confirming"
    ? transitionReceipt(receipt, receipt.idempotencyKey, "unknown")
    : receipt;
  return {
    ...(command ? { command } : {}),
    ...(recoveredReceipt ? { receipt: recoveredReceipt } : {}),
    ...(hydrated.abandonedUnknown ? { abandonedUnknown: true as const } : {}),
    nextOperationId: 1,
  };
}

export function surfaceActionStatus(
  state: SurfaceActionState,
): "idle" | SurfaceActionReceiptStatus {
  return state.receipt?.status ?? "idle";
}

export function isSurfaceActionBusy(state: SurfaceActionState): boolean {
  return state.operation !== undefined;
}

export function beginSurfaceAction(
  state: SurfaceActionState,
  command: SurfaceActionCommand,
): SurfaceActionTransition {
  if (state.operation || state.command) return { state, accepted: false };
  return startOperation(state, "execute", command, {
    idempotencyKey: command.idempotencyKey,
    status: "pending",
  });
}

export function retrySurfaceAction(state: SurfaceActionState): SurfaceActionTransition {
  if (
    state.operation ||
    state.abandonedUnknown ||
    !state.command ||
    (state.receipt?.status !== "failed" && state.receipt?.status !== "conflicted") ||
    state.receipt.error?.retryable !== true
  ) {
    return { state, accepted: false };
  }
  return startOperation(
    state,
    "execute",
    state.command,
    transitionReceipt(state.receipt, state.command.idempotencyKey, "pending"),
  );
}

export function reconcileSurfaceAction(state: SurfaceActionState): SurfaceActionTransition {
  if (
    state.operation ||
    !state.command ||
    !state.receipt ||
    !["pending", "confirming", "unknown"].includes(state.receipt.status)
  ) {
    return { state, accepted: false };
  }
  return startOperation(
    state,
    "reconcile",
    state.command,
    transitionReceipt(state.receipt, state.command.idempotencyKey, "confirming"),
    state.receipt,
  );
}

export function beginAbandonUnknownSurfaceAction(
  state: SurfaceActionState,
  acknowledgePossibleEffects: boolean,
): SurfaceActionTransition {
  if (
    !acknowledgePossibleEffects ||
    state.operation ||
    state.abandonedUnknown ||
    !state.command ||
    state.receipt?.status !== "unknown"
  ) {
    return { state, accepted: false };
  }
  return startOperation(
    state,
    "abandon",
    state.command,
    transitionReceipt(state.receipt, state.command.idempotencyKey, "confirming"),
    state.receipt,
  );
}

export function applySurfaceActionReceipt(
  state: SurfaceActionState,
  operationId: number,
  receipt: SurfaceActionReceipt,
): SurfaceActionState {
  if (state.operation?.id !== operationId || !state.command) return state;
  const normalized = normalizeReceipt(receipt);
  if (receipt.idempotencyKey !== state.command.idempotencyKey) {
    throw new Error("surface_action_receipt_key_mismatch");
  }
  return { ...withoutOperation(state), receipt: normalized };
}

/** A dispatched execute with no authoritative receipt is always outcome-unknown. */
export function markSurfaceActionUnknown(
  state: SurfaceActionState,
  operationId: number,
): SurfaceActionState {
  if (state.operation?.id !== operationId || !state.command) return state;
  return {
    ...withoutOperation(state),
    receipt: transitionReceipt(state.receipt, state.command.idempotencyKey, "unknown"),
  };
}

/** A missing or failed reconciliation preserves unknown, never invents failure. */
export function finishSurfaceActionReconciliationUnknown(
  state: SurfaceActionState,
  operationId: number,
): SurfaceActionState {
  if (state.operation?.id !== operationId || state.operation.kind !== "reconcile" || !state.command) {
    return state;
  }
  const previous = state.operation.previousReceipt;
  return {
    ...withoutOperation(state),
    receipt: previous?.status === "pending"
      ? previous
      : transitionReceipt(previous ?? state.receipt, state.command.idempotencyKey, "unknown"),
  };
}

/** A failed abandon request returns to unknown; it never executes the action. */
export function finishSurfaceActionAbandonmentUnknown(
  state: SurfaceActionState,
  operationId: number,
): SurfaceActionState {
  if (state.operation?.id !== operationId || state.operation.kind !== "abandon" || !state.command) {
    return state;
  }
  return {
    ...withoutOperation(state),
    receipt: transitionReceipt(
      state.operation.previousReceipt ?? state.receipt,
      state.command.idempotencyKey,
      "unknown",
    ),
  };
}

function startOperation(
  state: SurfaceActionState,
  kind: SurfaceActionOperation,
  command: SurfaceActionCommand,
  receipt: SurfaceActionReceipt,
  previousReceipt?: SurfaceActionReceipt,
): SurfaceActionTransition {
  const operationId = state.nextOperationId;
  const commandSnapshot = snapshotCommand(command);
  return {
    accepted: true,
    operationId,
    state: {
      ...state,
      command: commandSnapshot,
      receipt: normalizeReceipt(receipt),
      ...(kind === "abandon" ? { abandonedUnknown: true as const } : {}),
      operation: {
        id: operationId,
        kind,
        ...(previousReceipt ? { previousReceipt: normalizeReceipt(previousReceipt) } : {}),
      },
      nextOperationId: operationId + 1,
    },
  };
}

function withoutOperation(state: SurfaceActionState): SurfaceActionState {
  const { operation: _operation, ...rest } = state;
  return rest;
}

function assertCommandKey(command: SurfaceActionCommand): void {
  if (!command.idempotencyKey.trim()) throw new Error("surface_action_idempotency_key_required");
  if (command.input !== undefined && !isJsonValue(command.input)) {
    throw new Error("surface_action_input_must_be_json");
  }
}

function assertSurfaceActionReceipt(receipt: SurfaceActionReceipt): void {
  if (!receipt.idempotencyKey.trim()) throw new Error("surface_action_receipt_key_required");
  if (!RECEIPT_STATUSES.has(receipt.status)) throw new Error("surface_action_receipt_status_invalid");
  if (receipt.result !== undefined && !isJsonValue(receipt.result)) {
    throw new Error("surface_action_receipt_result_must_be_json");
  }
  if (!receipt.error?.code && receipt.error) throw new Error("surface_action_receipt_error_code_required");
}

function snapshotCommand(command: SurfaceActionCommand): SurfaceActionCommand {
  assertCommandKey(command);
  const snapshot: SurfaceActionCommand = {
    idempotencyKey: command.idempotencyKey,
    threadId: command.threadId,
    ...(command.turnId ? { turnId: command.turnId } : {}),
    surfaceId: command.surfaceId,
    revision: command.revision,
    actionId: command.actionId,
    action: command.action,
    ...(command.input !== undefined ? { input: cloneAndFreezeJson(command.input) } : {}),
  };
  return Object.freeze(snapshot);
}

function normalizeReceipt(receipt: SurfaceActionReceipt): SurfaceActionReceipt {
  assertSurfaceActionReceipt(receipt);
  const transitional = receipt.status === "pending" || receipt.status === "confirming";
  const normalized: SurfaceActionReceipt = {
    idempotencyKey: receipt.idempotencyKey,
    status: receipt.status,
    ...(receipt.receiptId ? { receiptId: receipt.receiptId } : {}),
    ...(!transitional && receipt.result !== undefined
      ? { result: cloneAndFreezeJson(receipt.result) }
      : {}),
    ...(!transitional && receipt.error
      ? { error: Object.freeze({ ...receipt.error }) }
      : {}),
    ...(receipt.updatedAt ? { updatedAt: receipt.updatedAt } : {}),
  };
  return Object.freeze(normalized);
}

function transitionReceipt(
  previous: SurfaceActionReceipt | undefined,
  idempotencyKey: string,
  status: "pending" | "confirming" | "unknown",
): SurfaceActionReceipt {
  return normalizeReceipt({
    idempotencyKey,
    status,
    ...(previous?.receiptId ? { receiptId: previous.receiptId } : {}),
    ...(previous?.updatedAt ? { updatedAt: previous.updatedAt } : {}),
  });
}

function cloneAndFreezeJson(value: JsonValue): JsonValue {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return Object.freeze(value.map((entry) => cloneAndFreezeJson(entry))) as JsonValue;
  }
  return Object.freeze(Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [key, cloneAndFreezeJson(nested)]),
  )) as JsonValue;
}
