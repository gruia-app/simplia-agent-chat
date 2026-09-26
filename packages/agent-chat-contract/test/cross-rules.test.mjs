import assert from "node:assert/strict";
import test from "node:test";

import { SCHEMAS, validateToolSpecRules } from "../dist/index.js";

function baseSpec(overrides = {}) {
  return {
    name: "memoria.recordar",
    app_key: "insaidr",
    effect: "reversible",
    confirm: "card",
    cost: { kind: "none", estimator: false },
    undo: { mode: "revert", window_s: 60, grace_s: 0 },
    output_schema: SCHEMAS["proposal-ref"],
    ...overrides,
  };
}

const cases = [
  {
    name: "read with confirm card -> read_requires_confirm_none",
    spec: baseSpec({ effect: "read", confirm: "card", output_schema: { type: "object" } }),
    expected: ["read_requires_confirm_none"],
  },
  {
    name: "read with confirm strong -> read_requires_confirm_none",
    spec: baseSpec({ effect: "read", confirm: "strong", output_schema: { type: "object" } }),
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
    spec: baseSpec({ effect: "read", confirm: "none", undo: { mode: "none", window_s: 0, grace_s: 0 }, output_schema: { type: "object" } }),
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
  // --- rev 4: output_schema ---
  {
    name: "read without output_schema -> read_requires_output_schema",
    spec: (() => { const s = baseSpec({ effect: "read", confirm: "none" }); delete s.output_schema; return s; })(),
    expected: ["read_requires_output_schema"],
  },
  {
    name: "write without output_schema -> write_requires_proposal_ref_output",
    spec: (() => { const s = baseSpec(); delete s.output_schema; return s; })(),
    expected: ["write_requires_proposal_ref_output"],
  },
  {
    name: "write with wrong output_schema -> write_requires_proposal_ref_output",
    spec: baseSpec({ output_schema: { type: "object" } }),
    expected: ["write_requires_proposal_ref_output"],
  },
  {
    name: "write with ProposalRef output_schema -> ok",
    spec: baseSpec(),
    expected: [],
  },
  // --- rev 5: name restrictions ---
  {
    name: "double underscore in ns -> forbidden_double_underscore",
    spec: baseSpec({ name: "mem__oria.recordar" }),
    expected: ["forbidden_double_underscore"],
  },
  {
    name: "double underscore in app_key -> forbidden_double_underscore",
    spec: baseSpec({ app_key: "in__saidr" }),
    expected: ["forbidden_double_underscore"],
  },
  {
    name: "reserved proposal namespace -> reserved_namespace_proposal",
    spec: baseSpec({ name: "proposal.recordar" }),
    expected: ["reserved_namespace_proposal"],
  },
  {
    name: "projection over 64 chars -> mcp_projection_too_long",
    spec: baseSpec({ app_key: "a".repeat(40), name: "memorialargo.recordarverbosolargo" }),
    expected: ["mcp_projection_too_long"],
  },
  {
    name: "projection of exactly 64 chars -> ok",
    spec: baseSpec({ app_key: "a".repeat(30), name: "b".repeat(17) + "." + "c".repeat(13) }),
    expected: [],
  },
];

for (const { name, spec, expected } of cases) {
  test(`cross rules: ${name}`, () => {
    const codes = validateToolSpecRules(spec).map((error) => error.code);
    assert.deepEqual(codes.sort(), expected.slice().sort());
  });
}
