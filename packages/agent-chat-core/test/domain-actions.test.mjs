import assert from "node:assert/strict";
import test from "node:test";

import {
  applySurfaceActionReceipt,
  beginAbandonUnknownSurfaceAction,
  beginSurfaceAction,
  createSurfaceActionState,
  finishSurfaceActionAbandonmentUnknown,
  finishSurfaceActionReconciliationUnknown,
  isSurfaceActionBusy,
  markSurfaceActionUnknown,
  reconcileSurfaceAction,
  retrySurfaceAction,
  surfaceActionStatus,
} from "../dist/index.js";

const command = Object.freeze({
  idempotencyKey: "action-key-1",
  threadId: "thread-1",
  turnId: "turn-1",
  surfaceId: "surface-1",
  revision: 4,
  actionId: "apply",
  action: "milestone.proposal.apply",
  input: { revision: 4 },
});

test("202/in-progress receipt remains pending with the stable command key", () => {
  const started = beginSurfaceAction(createSurfaceActionState(), command);
  assert.equal(started.accepted, true);
  assert.equal(isSurfaceActionBusy(started.state), true);
  assert.equal(surfaceActionStatus(started.state), "pending");

  const settled = applySurfaceActionReceipt(started.state, started.operationId, {
    idempotencyKey: command.idempotencyKey,
    status: "pending",
    receiptId: "receipt-202",
  });
  assert.equal(isSurfaceActionBusy(settled), false);
  assert.equal(surfaceActionStatus(settled), "pending");
  assert.equal(settled.command.idempotencyKey, command.idempotencyKey);
});

test("a replayed success settles the original command without changing its key", () => {
  const started = beginSurfaceAction(createSurfaceActionState(), command);
  const settled = applySurfaceActionReceipt(started.state, started.operationId, {
    idempotencyKey: command.idempotencyKey,
    status: "succeeded",
    result: { replayed: true },
  });

  assert.equal(surfaceActionStatus(settled), "succeeded");
  assert.deepEqual(settled.receipt.result, { replayed: true });
  assert.deepEqual(settled.command, command);
  assert.notStrictEqual(settled.command, command);
  assert.equal(beginSurfaceAction(settled, command).accepted, false);
});

test("409 conflict can retry only the same command and idempotency key", () => {
  const first = beginSurfaceAction(createSurfaceActionState(), command);
  const conflicted = applySurfaceActionReceipt(first.state, first.operationId, {
    idempotencyKey: command.idempotencyKey,
    status: "conflicted",
    error: { code: "surface_revision_conflict", retryable: true },
  });
  const retry = retrySurfaceAction(conflicted);

  assert.equal(retry.accepted, true);
  assert.deepEqual(retry.state.command, command);
  assert.notStrictEqual(retry.state.command, conflicted.command);
  assert.equal(retry.state.receipt.idempotencyKey, command.idempotencyKey);
  assert.equal(retry.state.receipt.status, "pending");
});

test("unknown outcome reconciles by key and a missing receipt remains unknown", () => {
  const started = beginSurfaceAction(createSurfaceActionState(), command);
  const unknown = markSurfaceActionUnknown(started.state, started.operationId);
  assert.equal(surfaceActionStatus(unknown), "unknown");
  assert.equal(unknown.receipt.idempotencyKey, command.idempotencyKey);
  assert.equal(retrySurfaceAction(unknown).accepted, false);

  const reconciling = reconcileSurfaceAction(unknown);
  assert.equal(reconciling.accepted, true);
  assert.equal(reconciling.state.receipt.status, "confirming");
  assert.equal(reconciling.state.receipt.idempotencyKey, command.idempotencyKey);

  const stillUnknown = finishSurfaceActionReconciliationUnknown(
    reconciling.state,
    reconciling.operationId,
  );
  assert.equal(stillUnknown.receipt.status, "unknown");
  assert.equal(stillUnknown.receipt.idempotencyKey, command.idempotencyKey);

  const secondReconcile = reconcileSurfaceAction(stillUnknown);
  const succeeded = applySurfaceActionReceipt(secondReconcile.state, secondReconcile.operationId, {
    idempotencyKey: command.idempotencyKey,
    status: "succeeded",
    receiptId: "receipt-recovered",
  });
  assert.equal(succeeded.receipt.status, "succeeded");
});

test("abandon unknown requires acknowledgement and is not an execute retry", () => {
  const started = beginSurfaceAction(createSurfaceActionState(), command);
  const unknown = markSurfaceActionUnknown(started.state, started.operationId);

  assert.equal(beginAbandonUnknownSurfaceAction(unknown, false).accepted, false);
  const abandoning = beginAbandonUnknownSurfaceAction(unknown, true);
  assert.equal(abandoning.accepted, true);
  assert.equal(abandoning.state.operation.kind, "abandon");
  assert.equal(abandoning.state.receipt.status, "confirming");
  assert.equal(abandoning.state.receipt.idempotencyKey, command.idempotencyKey);

  const rejected = finishSurfaceActionAbandonmentUnknown(
    abandoning.state,
    abandoning.operationId,
  );
  assert.equal(rejected.receipt.status, "unknown");
  assert.equal(rejected.receipt.idempotencyKey, command.idempotencyKey);
});

test("abandonment is terminal even if its remote failure incorrectly grants retry", () => {
  const started = beginSurfaceAction(createSurfaceActionState(), command);
  const unknown = markSurfaceActionUnknown(started.state, started.operationId);
  const abandoning = beginAbandonUnknownSurfaceAction(unknown, true);
  const abandoned = applySurfaceActionReceipt(abandoning.state, abandoning.operationId, {
    idempotencyKey: command.idempotencyKey,
    status: "failed",
    error: { code: "unknown_abandoned", retryable: true },
  });
  assert.equal(abandoned.abandonedUnknown, true);
  assert.equal(retrySurfaceAction(abandoned).accepted, false);
  assert.equal(beginAbandonUnknownSurfaceAction(abandoned, true).accepted, false);

  const reloaded = createSurfaceActionState({
    command: abandoned.command,
    receipt: abandoned.receipt,
    abandonedUnknown: abandoned.abandonedUnknown,
  });
  assert.equal(retrySurfaceAction(reloaded).accepted, false);
});

test("authoritative failures are never retryable without an explicit grant", () => {
  const started = beginSurfaceAction(createSurfaceActionState(), command);
  const explicitFailure = applySurfaceActionReceipt(started.state, started.operationId, {
    idempotencyKey: command.idempotencyKey,
    status: "failed",
    error: { code: "authoritative_failure" },
  });
  assert.equal(retrySurfaceAction(explicitFailure).accepted, false);
});

test("double starts and stale asynchronous results are ignored", () => {
  const first = beginSurfaceAction(createSurfaceActionState(), command);
  assert.equal(beginSurfaceAction(first.state, command).accepted, false);

  const conflict = applySurfaceActionReceipt(first.state, first.operationId, {
    idempotencyKey: command.idempotencyKey,
    status: "conflicted",
    error: { code: "surface_revision_conflict", retryable: true },
  });
  const retry = retrySurfaceAction(conflict);
  const stale = applySurfaceActionReceipt(retry.state, first.operationId, {
    idempotencyKey: command.idempotencyKey,
    status: "succeeded",
  });
  assert.strictEqual(stale, retry.state);
  assert.equal(stale.receipt.status, "pending");

  const current = applySurfaceActionReceipt(stale, retry.operationId, {
    idempotencyKey: command.idempotencyKey,
    status: "succeeded",
  });
  assert.equal(current.receipt.status, "succeeded");
});

test("hydration preserves the key and rejects mismatched persisted receipts", () => {
  const hydrated = createSurfaceActionState({
    command,
    receipt: { idempotencyKey: command.idempotencyKey, status: "unknown" },
  });
  assert.equal(hydrated.command.idempotencyKey, command.idempotencyKey);
  assert.equal(reconcileSurfaceAction(hydrated).state.receipt.idempotencyKey, command.idempotencyKey);

  assert.throws(() => createSurfaceActionState({
    command,
    receipt: { idempotencyKey: "different", status: "unknown" },
  }), /surface_action_hydration_key_mismatch/);

  assert.throws(() => createSurfaceActionState({ command }), /surface_action_hydration_receipt_required/);
  assert.throws(() => createSurfaceActionState({
    receipt: { idempotencyKey: command.idempotencyKey, status: "unknown" },
  }), /surface_action_hydration_command_required/);
});

test("confirming reload normalizes to an unknown state that can reconcile", () => {
  const hydrated = createSurfaceActionState({
    command,
    receipt: {
      idempotencyKey: command.idempotencyKey,
      status: "confirming",
      receiptId: "receipt-confirming",
      result: { unsafe: "stale" },
      error: { code: "stale_error", retryable: true },
    },
  });
  assert.equal(hydrated.receipt.status, "unknown");
  assert.equal(hydrated.receipt.receiptId, "receipt-confirming");
  assert.equal(hydrated.receipt.result, undefined);
  assert.equal(hydrated.receipt.error, undefined);
  assert.equal(reconcileSurfaceAction(hydrated).accepted, true);
});

test("pending reconciliation failure preserves the authoritative pending receipt", () => {
  const started = beginSurfaceAction(createSurfaceActionState(), command);
  const pending = applySurfaceActionReceipt(started.state, started.operationId, {
    idempotencyKey: command.idempotencyKey,
    status: "pending",
    receiptId: "receipt-pending",
    result: { mustNotSurvive: true },
    error: { code: "must_not_survive", retryable: true },
  });
  assert.equal(pending.receipt.result, undefined);
  assert.equal(pending.receipt.error, undefined);

  const reconciling = reconcileSurfaceAction(pending);
  assert.equal(reconciling.state.receipt.status, "confirming");
  assert.equal(reconciling.state.receipt.result, undefined);
  assert.equal(reconciling.state.receipt.error, undefined);
  const restored = finishSurfaceActionReconciliationUnknown(
    reconciling.state,
    reconciling.operationId,
  );
  assert.strictEqual(restored.receipt, reconciling.state.operation.previousReceipt);
  assert.equal(restored.receipt.status, "pending");
  assert.equal(restored.receipt.receiptId, "receipt-pending");
});

test("begin and retry capture deeply immutable command snapshots", () => {
  const mutableCommand = {
    ...command,
    input: {
      proposal: { title: "Original", steps: [{ order: 1 }] },
      tags: ["safe"],
    },
  };
  const started = beginSurfaceAction(createSurfaceActionState(), mutableCommand);
  mutableCommand.input.proposal.title = "Mutated";
  mutableCommand.input.proposal.steps[0].order = 99;
  mutableCommand.input.tags.push("late");

  assert.deepEqual(started.state.command.input, {
    proposal: { title: "Original", steps: [{ order: 1 }] },
    tags: ["safe"],
  });
  assert.equal(Object.isFrozen(started.state.command), true);
  assert.equal(Object.isFrozen(started.state.command.input), true);
  assert.equal(Object.isFrozen(started.state.command.input.proposal.steps[0]), true);

  const conflicted = applySurfaceActionReceipt(started.state, started.operationId, {
    idempotencyKey: command.idempotencyKey,
    status: "conflicted",
    error: { code: "conflict", retryable: true },
  });
  const retry = retrySurfaceAction(conflicted);
  assert.notStrictEqual(retry.state.command, conflicted.command);
  assert.deepEqual(retry.state.command, conflicted.command);
  assert.equal(Object.isFrozen(retry.state.command.input.proposal.steps), true);
});
