import assert from "node:assert/strict";
import test from "node:test";

import { validateToolSpecRules } from "../dist/index.js";

function baseSpec(overrides = {}) {
  return {
    effect: "reversible",
    confirm: "card",
    cost: { kind: "none", estimator: false },
    undo: { mode: "revert", window_s: 60, grace_s: 0 },
    ...overrides,
  };
}

const cases = [
  {
    name: "read with confirm card -> read_requires_confirm_none",
    spec: baseSpec({ effect: "read", confirm: "card" }),
    expected: ["read_requires_confirm_none"],
  },
  {
    name: "read with confirm strong -> read_requires_confirm_none",
    spec: baseSpec({ effect: "read", confirm: "strong" }),
    expected: ["read_requires_confirm_none"],
  },
  {
    name: "reversible with confirm none -> reversible_requires_card_or_strong",
    spec: baseSpec({ effect: "reversible", confirm: "none" }),
    expected: ["reversible_requires_card_or_strong"],
  },
  {
    name: "irreversible with confirm card -> irreversible_requires_confirm_strong",
    spec: baseSpec({ effect: "irreversible", confirm: "card", undo: { mode: "none", window_s: 0, grace_s: 0 } }),
    expected: ["irreversible_requires_confirm_strong"],
  },
  {
    name: "irreversible with confirm none -> irreversible_requires_confirm_strong",
    spec: baseSpec({ effect: "irreversible", confirm: "none", undo: { mode: "none", window_s: 0, grace_s: 0 } }),
    expected: ["irreversible_requires_confirm_strong"],
  },
  {
    name: "irreversible with undo revert -> irreversible_forbids_undo_revert",
    spec: baseSpec({ effect: "irreversible", confirm: "strong", undo: { mode: "revert", window_s: 0, grace_s: 0 } }),
    expected: ["irreversible_forbids_undo_revert"],
  },
  {
    name: "irreversible strong with undo compensate -> ok",
    spec: baseSpec({ effect: "irreversible", confirm: "strong", undo: { mode: "compensate", window_s: 0, grace_s: 90 } }),
    expected: [],
  },
  {
    name: "irreversible strong with undo none -> ok",
    spec: baseSpec({ effect: "irreversible", confirm: "strong", undo: { mode: "none", window_s: 0, grace_s: 0 } }),
    expected: [],
  },
  {
    name: "reversible strong -> ok",
    spec: baseSpec({ effect: "reversible", confirm: "strong" }),
    expected: [],
  },
  {
    name: "read confirm none -> ok",
    spec: baseSpec({ effect: "read", confirm: "none", undo: { mode: "none", window_s: 0, grace_s: 0 } }),
    expected: [],
  },
  {
    name: "credits without estimator -> cost_kind_requires_estimator",
    spec: baseSpec({ cost: { kind: "credits", estimator: false } }),
    expected: ["cost_kind_requires_estimator"],
  },
  {
    name: "money without estimator -> cost_kind_requires_estimator",
    spec: baseSpec({ cost: { kind: "money", estimator: false } }),
    expected: ["cost_kind_requires_estimator"],
  },
  {
    name: "credits with estimator -> ok",
    spec: baseSpec({ cost: { kind: "credits", estimator: true } }),
    expected: [],
  },
  {
    name: "money with estimator -> ok",
    spec: baseSpec({ cost: { kind: "money", estimator: true } }),
    expected: [],
  },
  {
    name: "multiple violations accumulate",
    spec: baseSpec({
      effect: "irreversible",
      confirm: "card",
      undo: { mode: "revert", window_s: 0, grace_s: 0 },
      cost: { kind: "money", estimator: false },
    }),
    expected: [
      "irreversible_requires_confirm_strong",
      "irreversible_forbids_undo_revert",
      "cost_kind_requires_estimator",
    ],
  },
];

for (const { name, spec, expected } of cases) {
  test(`cross rules: ${name}`, () => {
    const codes = validateToolSpecRules(spec).map((error) => error.code);
    assert.deepEqual(codes.sort(), expected.slice().sort());
  });
}
