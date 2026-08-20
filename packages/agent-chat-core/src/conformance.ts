import { isJsonValue, type ChatEvent, type SurfaceBlock } from "./protocol.js";
import { createInitialChatState, reduceChatEvent, replayChatEvents } from "./state.js";
import { createSurfaceActionCommand, SurfaceRegistry, type SurfacePlugin } from "./surfaces.js";

export type ConformanceSeverity = "error" | "warning";

export interface ConformanceCheck {
  readonly id: string;
  readonly description: string;
  readonly passed: boolean;
  readonly severity: ConformanceSeverity;
  readonly detail: string;
}

export interface ConformanceReport {
  readonly ok: boolean;
  readonly checks: readonly ConformanceCheck[];
}

export class ConformanceError extends Error {
  readonly report: ConformanceReport;

  constructor(report: ConformanceReport) {
    super(formatConformanceReport(report));
    this.name = "ConformanceError";
    this.report = report;
  }
}

const DETAIL = Object.freeze({
  pluginRegistered: "surface plugin kind and versions are registered",
  pluginNotRegistered: "surface plugin kind and versions were not registered",
  validDecoded: "valid surface payload decoded to JSON",
  validNotDecoded: "valid surface payload did not decode to JSON",
  invalidRejected: "invalid surface payload was rejected",
  invalidAccepted: "invalid surface payload was accepted",
  unknownClosed: "unknown surface kind failed closed",
  unknownOpened: "unknown surface kind did not fail closed",
  summaryPresent: "surface summary and accessibility label are non-empty",
  summaryMissing: "surface summary or accessibility label was empty",
  canaryIsolated: "surface output did not leak the payload canary",
  canaryLeaked: "surface output leaked the payload canary",
  actionIdempotent: "surface action commands are idempotent for the same key",
  actionNotIdempotent: "surface action commands were not idempotent",
  actionJsonRejected: "non-JSON surface action input was rejected",
  actionJsonAccepted: "non-JSON surface action input was accepted",
  replayMalformed: "malformed replay input was rejected",
  replayMalformedAccepted: "malformed replay input was accepted",
  replayUnknown: "unknown replay event type was rejected",
  replayUnknownAccepted: "unknown replay event type was accepted",
  replayDuplicate: "duplicate replay events were rejected",
  replayDuplicateAccepted: "duplicate replay events were accepted",
  replayDeterministic: "replay of the same events was deterministic",
  replayNotDeterministic: "replay of the same events was not deterministic",
  replayMissingEvents: "replay fixture did not include events",
  surfaceFixturesPresent: "surface conformance fixtures are present",
  surfaceFixturesMissing: "surface conformance fixtures were missing",
});

function freezeReport(checks: ConformanceCheck[]): ConformanceReport {
  const frozenChecks = Object.freeze(checks.map((check) => Object.freeze({ ...check })));
  return Object.freeze({
    ok: frozenChecks.every((check) => check.passed || check.severity === "warning"),
    checks: frozenChecks,
  });
}

function check(
  id: string,
  description: string,
  passed: boolean,
  passDetail: string,
  failDetail: string,
  severity: ConformanceSeverity = "error",
): ConformanceCheck {
  return {
    id,
    description,
    passed,
    severity,
    detail: passed ? passDetail : failDetail,
  };
}

function cloneJson<T>(value: T): T | undefined {
  try {
    return structuredClone(value);
  } catch {
    return undefined;
  }
}

function cloneUnknown(value: unknown): unknown {
  try {
    return structuredClone(value);
  } catch {
    return value;
  }
}

function containsCanary(value: unknown, canary: string): boolean {
  if (!canary) return false;
  if (typeof value === "string") return value.includes(canary);
  if (typeof value === "number" || typeof value === "boolean" || value == null) return false;
  try {
    return JSON.stringify(value).includes(canary);
  } catch {
    return false;
  }
}

function sameJson(left: unknown, right: unknown): boolean {
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

export function formatConformanceReport(report: ConformanceReport): string {
  const status = report.ok ? "passed" : "failed";
  const lines = [
    `conformance ${status}`,
    ...report.checks.map((entry) => {
      const result = entry.passed ? "pass" : "fail";
      return `${entry.id} ${result} ${entry.severity} ${entry.detail}`;
    }),
  ];
  return lines.join("\n");
}

export function assertConformance(report: ConformanceReport): asserts report is ConformanceReport & { ok: true } {
  if (!report.ok) throw new ConformanceError(report);
}

export interface SurfaceConformanceFixture {
  readonly plugin: SurfacePlugin;
  readonly validBlock: SurfaceBlock;
  readonly invalidBlock: SurfaceBlock;
  readonly payloadCanary: string;
  readonly actionId?: string | undefined;
  readonly nonJsonActionInput?: unknown;
}

export interface ReplayConformanceFixture {
  readonly events: readonly ChatEvent[];
  readonly malformedEvent: unknown;
  readonly unknownTypeEvent: unknown;
}

export interface CoreConformanceInput {
  readonly surfaces: readonly SurfaceConformanceFixture[];
  readonly replay?: ReplayConformanceFixture | undefined;
}

function runSurfaceFixture(fixture: SurfaceConformanceFixture, prefix: string): ConformanceCheck[] {
  const checks: ConformanceCheck[] = [];
  const registry = new SurfaceRegistry();
  let registered = false;
  try {
    registry.register(fixture.plugin);
    const versions = fixture.plugin.versions;
    registered = Boolean(
      fixture.plugin.kind.trim()
      && versions.length > 0
      && versions.every((version) => Number.isInteger(version) && version > 0)
      && new Set(versions).size === versions.length
      && registry.resolve(fixture.plugin.kind)
      && versions.includes(fixture.validBlock.schemaVersion),
    );
  } catch {
    registered = false;
  }
  checks.push(check(
    `${prefix}plugin-registration`,
    "Register plugin kind and supported versions",
    registered,
    DETAIL.pluginRegistered,
    DETAIL.pluginNotRegistered,
  ));

  const validBlock = cloneJson(fixture.validBlock);
  let decodedPayload: unknown;
  let validDecoded = false;
  if (registered && validBlock) {
    try {
      const decoded = registry.decode(validBlock);
      validDecoded = Boolean(decoded && isJsonValue(decoded.block.payload));
      decodedPayload = decoded?.block.payload;
    } catch {
      validDecoded = false;
    }
  }
  checks.push(check(
    `${prefix}valid-decode`,
    "Decode a valid surface payload to JSON",
    validDecoded,
    DETAIL.validDecoded,
    DETAIL.validNotDecoded,
  ));

  const invalidBlock = cloneJson(fixture.invalidBlock);
  let invalidRejected = false;
  let invalidExceptionLeaked = false;
  if (invalidBlock) {
    try {
      const decoded = registry.decode(invalidBlock);
      invalidRejected = decoded === undefined;
    } catch (error) {
      invalidRejected = true;
      invalidExceptionLeaked = containsCanary(error instanceof Error ? error.message : error, fixture.payloadCanary);
    }
  }
  checks.push(check(
    `${prefix}invalid-decode`,
    "Reject an invalid surface payload",
    invalidRejected,
    DETAIL.invalidRejected,
    DETAIL.invalidAccepted,
  ));

  let unknownKind = "conformance.unknown-kind";
  while (registry.resolve(unknownKind)) unknownKind = `${unknownKind}.unknown`;
  let unknownClosed = registry.resolve(unknownKind) === undefined;
  const unknownBlock = validBlock
    ? { ...validBlock, kind: unknownKind }
    : undefined;
  if (unknownBlock) {
    try {
      unknownClosed = unknownClosed && registry.decode(unknownBlock) === undefined;
    } catch {
      unknownClosed = false;
    }
  } else {
    unknownClosed = false;
  }
  checks.push(check(
    `${prefix}unknown-kind`,
    "Unknown surface kinds fail closed",
    unknownClosed,
    DETAIL.unknownClosed,
    DETAIL.unknownOpened,
  ));

  let summaryPresent = false;
  let canaryLeaked = invalidExceptionLeaked;
  if (validDecoded && decodedPayload !== undefined) {
    try {
      const summary = fixture.plugin.summarize(decodedPayload as never);
      const a11y = fixture.plugin.getA11yLabel(decodedPayload as never);
      summaryPresent = typeof summary === "string" && summary.trim().length > 0
        && typeof a11y === "string" && a11y.trim().length > 0;
      if (containsCanary(summary, fixture.payloadCanary) || containsCanary(a11y, fixture.payloadCanary)) {
        canaryLeaked = true;
      }
    } catch (error) {
      summaryPresent = false;
      if (containsCanary(error instanceof Error ? error.message : error, fixture.payloadCanary)) {
        canaryLeaked = true;
      }
    }
  }
  checks.push(check(
    `${prefix}summary-a11y`,
    "Summaries and accessibility labels are non-empty",
    summaryPresent,
    DETAIL.summaryPresent,
    DETAIL.summaryMissing,
  ));
  checks.push(check(
    `${prefix}canary-isolation`,
    "Payload canaries stay out of surface output",
    fixture.payloadCanary.trim().length > 0 && !canaryLeaked,
    DETAIL.canaryIsolated,
    DETAIL.canaryLeaked,
  ));

  const actionBlock = cloneJson(fixture.validBlock);
  const actionId = fixture.actionId ?? fixture.validBlock.actions?.[0]?.id;
  if (actionId) {
    let idempotent = false;
    if (actionBlock) {
      try {
        const first = createSurfaceActionCommand({
          block: actionBlock,
          actionId,
          idempotencyKey: "conformance-idempotency-key",
        });
        const second = createSurfaceActionCommand({
          block: actionBlock,
          actionId,
          idempotencyKey: "conformance-idempotency-key",
        });
        idempotent = first.idempotencyKey === "conformance-idempotency-key" && sameJson(first, second);
        try {
          createSurfaceActionCommand({
            block: actionBlock,
            actionId,
            idempotencyKey: " ",
          });
          idempotent = false;
        } catch {
          // expected rejection for an empty idempotency key
        }
      } catch {
        idempotent = false;
      }
    }
    checks.push(check(
      `${prefix}action-idempotency`,
      "Surface actions require an idempotency key and replay the same command",
      idempotent,
      DETAIL.actionIdempotent,
      DETAIL.actionNotIdempotent,
    ));

    let jsonRejected = false;
    if (actionBlock) {
      try {
        createSurfaceActionCommand({
          block: actionBlock,
          actionId,
          idempotencyKey: "conformance-idempotency-key",
          input: fixture.nonJsonActionInput ?? (() => undefined),
        });
        jsonRejected = false;
      } catch {
        jsonRejected = true;
      }
    }
    checks.push(check(
      `${prefix}action-json-input`,
      "Non-JSON surface action input is rejected",
      jsonRejected,
      DETAIL.actionJsonRejected,
      DETAIL.actionJsonAccepted,
    ));
  }

  return checks;
}

function runReplayFixture(replay: ReplayConformanceFixture): ConformanceCheck[] {
  const checks: ConformanceCheck[] = [];
  const malformed = reduceChatEvent(createInitialChatState(), cloneUnknown(replay.malformedEvent));
  checks.push(check(
    "replay.malformed",
    "Malformed replay input is rejected",
    malformed.applied === false && (
      malformed.reason === "invalid_event"
      || malformed.reason === "unsupported_protocol"
      || malformed.reason === "unknown_event_type"
    ),
    DETAIL.replayMalformed,
    DETAIL.replayMalformedAccepted,
  ));

  const unknownType = reduceChatEvent(createInitialChatState(), cloneUnknown(replay.unknownTypeEvent));
  checks.push(check(
    "replay.unknown-type",
    "Unknown replay event types are rejected",
    unknownType.applied === false && unknownType.reason === "unknown_event_type",
    DETAIL.replayUnknown,
    DETAIL.replayUnknownAccepted,
  ));

  const events = cloneJson(replay.events.slice()) ?? replay.events.slice();
  if (events.length === 0) {
    checks.push(check(
      "replay.duplicate",
      "Duplicate replay events are rejected",
      false,
      DETAIL.replayDuplicate,
      DETAIL.replayMissingEvents,
    ));
    checks.push(check(
      "replay.deterministic",
      "Replaying the same events is deterministic",
      false,
      DETAIL.replayDeterministic,
      DETAIL.replayMissingEvents,
    ));
    return checks;
  }

  const firstEvent = events[0];
  if (!firstEvent) {
    checks.push(check(
      "replay.duplicate",
      "Duplicate replay events are rejected",
      false,
      DETAIL.replayDuplicate,
      DETAIL.replayMissingEvents,
    ));
    checks.push(check(
      "replay.deterministic",
      "Replaying the same events is deterministic",
      false,
      DETAIL.replayDeterministic,
      DETAIL.replayMissingEvents,
    ));
    return checks;
  }

  const firstPass = replayChatEvents(events);
  const duplicate = reduceChatEvent(firstPass, firstEvent);
  checks.push(check(
    "replay.duplicate",
    "Duplicate replay events are rejected",
    duplicate.applied === false && duplicate.reason === "duplicate",
    DETAIL.replayDuplicate,
    DETAIL.replayDuplicateAccepted,
  ));

  const secondPass = replayChatEvents(cloneJson(events) ?? events);
  checks.push(check(
    "replay.deterministic",
    "Replaying the same events is deterministic",
    sameJson(firstPass, secondPass),
    DETAIL.replayDeterministic,
    DETAIL.replayNotDeterministic,
  ));

  return checks;
}

export function runCoreConformance(input: CoreConformanceInput): ConformanceReport {
  const surfaces = input.surfaces.slice();
  const checks: ConformanceCheck[] = [check(
    "surface.fixtures-present",
    "At least one surface conformance fixture is required",
    surfaces.length > 0,
    DETAIL.surfaceFixturesPresent,
    DETAIL.surfaceFixturesMissing,
  )];
  surfaces.forEach((fixture, index) => {
    const prefix = surfaces.length === 1 ? "surface." : `surface.${index}.`;
    checks.push(...runSurfaceFixture(fixture, prefix));
  });
  if (input.replay) checks.push(...runReplayFixture(input.replay));
  return freezeReport(checks);
}
