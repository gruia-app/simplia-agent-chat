import assert from "node:assert/strict";
import test from "node:test";

import {
  assertConformance,
  ConformanceError,
  formatConformanceReport,
  runCoreConformance,
} from "../dist/index.js";
import { baseSurface, baseThread, chatEvent, ISO } from "./helpers.mjs";

const CANARY = "payload-canary-secret-value";

function tablePlugin(overrides = {}) {
  return {
    kind: "data.table",
    versions: [1],
    validate(payload) {
      if (!payload || typeof payload !== "object" || !Array.isArray(payload.rows)) {
        throw new Error("rows_required");
      }
      return payload;
    },
    summarize(payload) {
      return `${payload.rows.length} rows`;
    },
    getA11yLabel(payload) {
      return `Table with ${payload.rows.length} rows`;
    },
    ...overrides,
  };
}

function passingInput() {
  const validBlock = baseSurface({
    payload: { rows: [{ id: 1 }], note: CANARY },
  });
  return {
    surfaces: [
      {
        plugin: tablePlugin(),
        validBlock,
        invalidBlock: baseSurface({ payload: { note: CANARY } }),
        payloadCanary: CANARY,
        actionId: "refresh",
        nonJsonActionInput: () => CANARY,
      },
    ],
    replay: {
      events: [
        chatEvent("thread.upsert", baseThread(), { id: "event-thread", turnId: null }),
        chatEvent("usage.updated", { totalTokens: 4 }, { id: "event-usage", turnId: null }),
      ],
      malformedEvent: { not: "an-event", secret: CANARY },
      unknownTypeEvent: {
        protocolVersion: 1,
        id: "event-unknown",
        type: "not.a.real.event",
        source: "test",
        occurredAt: ISO,
        threadId: "thread-1",
        payload: { secret: CANARY },
      },
    },
  };
}

function reportText(report) {
  return `${formatConformanceReport(report)}\n${report.checks.map((check) => `${check.id}:${check.detail}`).join("\n")}`;
}

test("core conformance passes for registered surfaces and deterministic replay", () => {
  const input = passingInput();
  const originalPayload = structuredClone(input.surfaces[0].validBlock.payload);
  const report = runCoreConformance(input);

  assert.equal(report.ok, true);
  assert.ok(report.checks.every((check) => check.passed));
  assert.ok(report.checks.some((check) => check.id === "surface.plugin-registration"));
  assert.ok(report.checks.some((check) => check.id === "replay.deterministic"));
  assert.deepEqual(input.surfaces[0].validBlock.payload, originalPayload);
  assertConformance(report);
});

test("core conformance fails closed for invalid payloads without echoing them", () => {
  const input = passingInput();
  input.surfaces[0].plugin = tablePlugin({
    validate(payload) {
      return payload;
    },
  });
  const report = runCoreConformance(input);

  assert.equal(report.ok, false);
  const invalid = report.checks.find((check) => check.id === "surface.invalid-decode");
  assert.equal(invalid.passed, false);
  assert.equal(invalid.detail, "invalid surface payload was accepted");
  assert.doesNotMatch(reportText(report), new RegExp(CANARY));
});

test("core conformance reports canary leaks with fixed safe details", () => {
  const input = passingInput();
  input.surfaces[0].plugin = tablePlugin({
    summarize(payload) {
      return payload.note;
    },
    getA11yLabel(payload) {
      return payload.note;
    },
  });
  const report = runCoreConformance(input);

  assert.equal(report.ok, false);
  const leak = report.checks.find((check) => check.id === "surface.canary-isolation");
  assert.equal(leak.passed, false);
  assert.equal(leak.detail, "surface output leaked the payload canary");
  assert.doesNotMatch(reportText(report), new RegExp(CANARY));
  assert.throws(() => assertConformance(report), ConformanceError);
  try {
    assertConformance(report);
  } catch (error) {
    assert.equal(error.name, "ConformanceError");
    assert.doesNotMatch(error.message, new RegExp(CANARY));
  }
});

test("core conformance keeps plugin exception text out of report details", () => {
  const input = passingInput();
  input.surfaces[0].plugin = tablePlugin({
    validate() {
      throw new Error(`unsafe:${CANARY}`);
    },
  });
  const report = runCoreConformance(input);

  assert.equal(report.ok, false);
  const valid = report.checks.find((check) => check.id === "surface.valid-decode");
  const invalid = report.checks.find((check) => check.id === "surface.invalid-decode");
  const leak = report.checks.find((check) => check.id === "surface.canary-isolation");
  assert.equal(valid.passed, false);
  assert.equal(invalid.passed, true);
  assert.equal(leak.passed, false);
  assert.doesNotMatch(reportText(report), /unsafe:/);
  assert.doesNotMatch(reportText(report), new RegExp(CANARY));
});

test("core conformance rejects duplicate replay and remains deterministic", () => {
  const input = passingInput();
  const report = runCoreConformance(input);
  const duplicate = report.checks.find((check) => check.id === "replay.duplicate");
  const deterministic = report.checks.find((check) => check.id === "replay.deterministic");

  assert.equal(duplicate.passed, true);
  assert.equal(deterministic.passed, true);
  assert.equal(duplicate.detail, "duplicate replay events were rejected");
  assert.equal(deterministic.detail, "replay of the same events was deterministic");
});

test("core conformance does not mutate caller fixtures", () => {
  const input = passingInput();
  const frozenPayload = Object.freeze({ rows: Object.freeze([{ id: 1 }]), note: CANARY });
  input.surfaces[0].validBlock.payload = frozenPayload;
  input.surfaces[0].plugin = tablePlugin({
    validate(payload) {
      payload.mutated = true;
      return payload;
    },
  });

  const report = runCoreConformance(input);
  assert.equal("mutated" in frozenPayload, false);
  assert.equal(report.ok, false);
  assert.doesNotMatch(reportText(report), new RegExp(CANARY));
});

test("core conformance rejects empty fixture suites", () => {
  const report = runCoreConformance({ surfaces: [] });
  assert.equal(report.ok, false);
  assert.equal(report.checks[0].id, "surface.fixtures-present");
  assert.equal(report.checks[0].passed, false);
});

test("core conformance rejects duplicate versions and whitespace-only output", () => {
  const duplicateVersions = passingInput();
  duplicateVersions.surfaces[0].plugin = tablePlugin({ versions: [1, 1] });
  const duplicateReport = runCoreConformance(duplicateVersions);
  assert.equal(
    duplicateReport.checks.find((check) => check.id === "surface.plugin-registration").passed,
    false,
  );

  const blankOutput = passingInput();
  blankOutput.surfaces[0].plugin = tablePlugin({
    summarize() { return "  "; },
    getA11yLabel() { return "\n"; },
  });
  const blankReport = runCoreConformance(blankOutput);
  assert.equal(blankReport.checks.find((check) => check.id === "surface.summary-a11y").passed, false);

  const blankCanary = passingInput();
  blankCanary.surfaces[0].payloadCanary = "  ";
  const canaryReport = runCoreConformance(blankCanary);
  assert.equal(canaryReport.checks.find((check) => check.id === "surface.canary-isolation").passed, false);
});

test("core conformance derives an actually unknown kind", () => {
  const input = passingInput();
  input.surfaces[0].plugin = tablePlugin({ kind: "conformance.unknown-kind" });
  input.surfaces[0].validBlock.kind = "conformance.unknown-kind";
  input.surfaces[0].invalidBlock.kind = "conformance.unknown-kind";
  const report = runCoreConformance(input);
  assert.equal(report.checks.find((check) => check.id === "surface.unknown-kind").passed, true);
});

test("core conformance never passes uncloneable blocks to consumer code", () => {
  const input = passingInput();
  let validateCalls = 0;
  input.surfaces[0].plugin = tablePlugin({
    validate(payload) {
      validateCalls += 1;
      return payload;
    },
  });
  input.surfaces[0].validBlock.payload = { rows: [], uncloneable: () => CANARY };
  input.surfaces[0].invalidBlock.payload = { uncloneable: () => CANARY };

  const report = runCoreConformance(input);
  assert.equal(validateCalls, 0);
  assert.equal(report.ok, false);
  assert.doesNotMatch(reportText(report), new RegExp(CANARY));
});
