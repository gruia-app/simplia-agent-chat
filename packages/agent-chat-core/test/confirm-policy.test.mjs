import assert from "node:assert/strict";
import test from "node:test";

import {
  IrreversibleAckRequiredError,
  assertIrreversibleAck,
  isConfirmEscalated,
  requiresIrreversibleAck,
  resolveConfirmEffective,
} from "../dist/confirm-policy.js";

const thresholds = { credits: 100, money_cents: 50 };

test("card escala a strong cuando estimate supera el umbral (credits)", () => {
  assert.equal(
    resolveConfirmEffective("card", { kind: "credits", amount: 101 }, thresholds),
    "strong",
  );
});

test("card escala a strong cuando estimate supera el umbral (money)", () => {
  assert.equal(
    resolveConfirmEffective("card", { kind: "money", amount: 51 }, thresholds),
    "strong",
  );
});

test("card no escala en el umbral exacto (debe superar)", () => {
  assert.equal(
    resolveConfirmEffective("card", { kind: "credits", amount: 100 }, thresholds),
    "card",
  );
});

test("card no escala por debajo del umbral", () => {
  assert.equal(
    resolveConfirmEffective("card", { kind: "credits", amount: 10 }, thresholds),
    "card",
  );
});

test("card no escala si el umbral no está definido", () => {
  assert.equal(resolveConfirmEffective("card", { kind: "credits", amount: 9999 }, {}), "card");
  assert.equal(
    resolveConfirmEffective("card", { kind: "money", amount: 9999 }, { credits: 1 }),
    "card",
  );
});

test("card no escala con estimate none o ausente", () => {
  assert.equal(resolveConfirmEffective("card", { kind: "none", amount: 0 }, thresholds), "card");
  assert.equal(resolveConfirmEffective("card", null, thresholds), "card");
});

test("strong y none nunca cambian", () => {
  assert.equal(resolveConfirmEffective("strong", { kind: "money", amount: 1e9 }, thresholds), "strong");
  assert.equal(resolveConfirmEffective("none", { kind: "money", amount: 1e9 }, thresholds), "none");
});

test("isConfirmEscalated", () => {
  assert.equal(isConfirmEscalated("card", "strong"), true);
  assert.equal(isConfirmEscalated("card", "card"), false);
  assert.equal(isConfirmEscalated("none", "none"), false);
});

test("requiresIrreversibleAck solo para strong", () => {
  assert.equal(requiresIrreversibleAck("strong"), true);
  assert.equal(requiresIrreversibleAck("card"), false);
  assert.equal(requiresIrreversibleAck("none"), false);
});

test("assertIrreversibleAck: strong sin ack lanza", () => {
  assert.throws(
    () => assertIrreversibleAck("strong", undefined),
    (e) => e instanceof IrreversibleAckRequiredError && e.code === "ack_irreversible_required",
  );
  assert.throws(() => assertIrreversibleAck("strong", false), IrreversibleAckRequiredError);
});

test("assertIrreversibleAck: strong con ack pasa; card/none no exigen", () => {
  assert.doesNotThrow(() => assertIrreversibleAck("strong", true));
  assert.doesNotThrow(() => assertIrreversibleAck("card", undefined));
  assert.doesNotThrow(() => assertIrreversibleAck("none", undefined));
});
