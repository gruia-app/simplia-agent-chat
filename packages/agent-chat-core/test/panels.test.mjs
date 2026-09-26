import assert from "node:assert/strict";
import test from "node:test";

import {
  activeMemoryEntries,
  createByoPanel,
  createMemoryPanel,
  derivePlanPanel,
  hasActiveByoKey,
  reduceByoPanel,
  reduceMemoryPanel,
} from "../dist/panels.js";

const entry = (id, over = {}) => ({ id, text: `dato ${id}`, createdAt: "2026-09-24T12:00:00Z", ...over });

test("memoria: recorded añade; forgotten marca y lo oculta a activeMemoryEntries", () => {
  let state = createMemoryPanel();
  state = reduceMemoryPanel(state, { type: "entry.recorded", entry: entry("m1") });
  state = reduceMemoryPanel(state, { type: "entry.recorded", entry: entry("m2", { sourceChangeId: "chg-1" }) });
  assert.equal(state.entries.length, 2);
  assert.equal(activeMemoryEntries(state).length, 2);
  state = reduceMemoryPanel(state, { type: "entry.forgotten", entryId: "m1", forgottenAt: "2026-09-24T12:30:00Z" });
  assert.equal(state.entries.length, 2);
  assert.deepEqual(activeMemoryEntries(state).map((e) => e.id), ["m2"]);
});

test("memoria: recorded con id existente reemplaza (idempotente)", () => {
  let state = createMemoryPanel([entry("m1")]);
  state = reduceMemoryPanel(state, {
    type: "entry.recorded",
    entry: { ...entry("m1"), text: "dato actualizado" },
  });
  assert.equal(state.entries.length, 1);
  assert.equal(state.entries[0].text, "dato actualizado");
});

test("plan: pressure normal/at_threshold/exceeded según uso", () => {
  const t = { credits: 100, money_cents: 500 };
  assert.equal(derivePlanPanel({ creditsUsed: 10 }, t).pressure, "normal");
  assert.equal(derivePlanPanel({ creditsUsed: 100 }, t).pressure, "at_threshold");
  assert.equal(derivePlanPanel({ creditsUsed: 101 }, t).pressure, "exceeded");
  assert.equal(derivePlanPanel({ moneyCentsUsed: 501 }, t).pressure, "exceeded");
  assert.equal(derivePlanPanel({}, t).pressure, "normal");
  assert.equal(derivePlanPanel({ creditsUsed: 9999 }, {}).pressure, "normal");
});

test("plan: conserva usage y period", () => {
  const panel = derivePlanPanel({ creditsUsed: 5, period: "2026-09" }, { credits: 10 });
  assert.equal(panel.usage.period, "2026-09");
  assert.equal(panel.thresholds.credits, 10);
});

test("byo: added/updated, revoked y hasActiveByoKey", () => {
  let state = createByoPanel();
  assert.equal(hasActiveByoKey(state), false);
  state = reduceByoPanel(state, {
    type: "key.added",
    entry: { provider: "openai", status: "active", keyLast4: "1234", addedAt: "2026-09-24T10:00:00Z" },
  });
  assert.equal(hasActiveByoKey(state), true);
  // re-add same provider updates
  state = reduceByoPanel(state, {
    type: "key.added",
    entry: { provider: "openai", status: "active", keyLast4: "9876" },
  });
  assert.equal(state.keys.length, 1);
  assert.equal(state.keys[0].keyLast4, "9876");
  state = reduceByoPanel(state, { type: "key.revoked", provider: "openai", revokedAt: "2026-09-24T11:00:00Z" });
  assert.equal(state.keys[0].status, "revoked");
  assert.equal(state.keys[0].revokedAt, "2026-09-24T11:00:00Z");
  assert.equal(hasActiveByoKey(state), false);
});
