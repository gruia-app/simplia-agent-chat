import assert from "node:assert/strict";
import test from "node:test";

import {
  InvalidTransitionError,
  TERMINAL_PROPOSAL_STATES,
  UndoWindowExpiredError,
  canTransition,
  isTerminalProposalState,
  transitionByModify,
  transitionProposal,
} from "../dist/proposal-machine.js";

const NOW = new Date("2026-09-24T12:00:00Z");
const proposal = (state) => ({ id: "p-1", state });

// §3: todas las transiciones permitidas
const allowed = [
  ["proposed", "modify"],
  ["proposed", "accept"],
  ["proposed", "discard"],
  ["proposed", "expire"],
  ["accepted", "apply"],
  ["accepted", "expire"],
  ["accepted", "discard"], // solo con gracia; canTransition es tabla pura
  ["applied", "revert"],
];

for (const [state, action] of allowed) {
  test(`§3 tabla: ${state} permite ${action}`, () => {
    assert.equal(canTransition(state, action), true);
  });
}

// §3: todas las combinaciones no listadas → false
const STATES = ["proposed", "modified", "accepted", "discarded", "expired", "applied", "reverted"];
const ACTIONS = ["modify", "accept", "discard", "expire", "apply", "revert"];
const allowedSet = new Set(allowed.map(([s, a]) => `${s}:${a}`));

test("§3 tabla: ninguna transición no listada está permitida", () => {
  for (const state of STATES) {
    for (const action of ACTIONS) {
      const expected = allowedSet.has(`${state}:${action}`);
      assert.equal(canTransition(state, action), expected, `${state} --${action}`);
    }
  }
});

test("proposed --accept--> accepted", () => {
  assert.deepEqual(transitionProposal(proposal("proposed"), "accept", { now: NOW }), {
    nextState: "accepted",
  });
});

test("proposed --discard--> discarded", () => {
  assert.equal(transitionProposal(proposal("proposed"), "discard", { now: NOW }).nextState, "discarded");
});

test("proposed --expire--> expired", () => {
  assert.equal(transitionProposal(proposal("proposed"), "expire", { now: NOW }).nextState, "expired");
});

test("accepted --expire--> expired", () => {
  assert.equal(transitionProposal(proposal("accepted"), "expire", { now: NOW }).nextState, "expired");
});

test("accepted --apply--> applied con change_id", () => {
  assert.deepEqual(
    transitionProposal(proposal("accepted"), "apply", { now: NOW, changeId: "chg-9" }),
    { nextState: "applied", changeId: "chg-9" },
  );
});

test("accepted --discard--> discarded solo durante la gracia", () => {
  assert.equal(
    transitionProposal(proposal("accepted"), "discard", { now: NOW, inGrace: true }).nextState,
    "discarded",
  );
  assert.throws(
    () => transitionProposal(proposal("accepted"), "discard", { now: NOW, inGrace: false }),
    (error) => error instanceof InvalidTransitionError && error.code === "invalid_transition",
  );
});

test("applied --revert--> reverted dentro de undo.window_s", () => {
  const ctx = {
    now: new Date("2026-09-24T12:00:30Z"),
    changeAppliedAt: NOW,
    undoWindowS: 60,
    changeId: "chg-1",
  };
  assert.equal(transitionProposal(proposal("applied"), "revert", ctx).nextState, "reverted");
});

test("applied --revert--> error fuera de ventana", () => {
  const ctx = {
    now: new Date("2026-09-24T12:02:00Z"),
    changeAppliedAt: NOW,
    undoWindowS: 60,
    changeId: "chg-1",
  };
  assert.throws(
    () => transitionProposal(proposal("applied"), "revert", ctx),
    (error) => error instanceof UndoWindowExpiredError && error.code === "undo_window_expired",
  );
});

test("modify: la propuesta origen pasa a discarded y marca supersedes", () => {
  assert.deepEqual(transitionByModify(proposal("proposed"), "p-2"), {
    nextState: "discarded",
    supersededBy: "p-2",
  });
});

for (const state of TERMINAL_PROPOSAL_STATES) {
  for (const action of ACTIONS) {
    test(`terminal ${state} rechaza ${action}`, () => {
      assert.throws(
        () => transitionProposal(proposal(state), action, { now: NOW }),
        InvalidTransitionError,
      );
    });
  }
}

test("invalid transitions lanzan InvalidTransitionError con code invalid_transition", () => {
  for (const [state, action] of [
    ["proposed", "apply"],
    ["proposed", "revert"],
    ["accepted", "modify"],
    ["accepted", "accept"],
    ["applied", "accept"],
    ["applied", "discard"],
    ["reverted", "revert"],
  ]) {
    assert.throws(
      () => transitionProposal(proposal(state), action, { now: NOW }),
      (error) =>
        error instanceof InvalidTransitionError &&
        error.code === "invalid_transition" &&
        error.from === state &&
        error.action === action,
      `${state} --${action}`,
    );
  }
});

test("isTerminalProposalState", () => {
  assert.equal(isTerminalProposalState("reverted"), true);
  assert.equal(isTerminalProposalState("discarded"), true);
  assert.equal(isTerminalProposalState("proposed"), false);
  assert.equal(isTerminalProposalState("accepted"), false);
  assert.equal(isTerminalProposalState("applied"), false);
});
