import { CHAT_PROTOCOL_VERSION } from "../dist/index.js";

export const ISO = "2026-08-13T12:00:00.000Z";

export function context(overrides = {}) {
  return {
    source: "test",
    threadId: "thread-1",
    turnId: "turn-1",
    appKey: "test-app",
    organizationId: "org-1",
    occurredAt: ISO,
    ...overrides,
  };
}

export function chatEvent(type, payload, overrides = {}) {
  return {
    protocolVersion: CHAT_PROTOCOL_VERSION,
    id: overrides.id ?? `event:${type}:${overrides.sequence ?? "plain"}`,
    type,
    source: overrides.source ?? "test",
    occurredAt: overrides.occurredAt ?? ISO,
    threadId: overrides.threadId ?? "thread-1",
    ...(overrides.turnId === null ? {} : { turnId: overrides.turnId ?? "turn-1" }),
    ...(overrides.streamId !== undefined && overrides.sequence !== undefined
      ? { stream: { id: overrides.streamId, sequence: overrides.sequence } }
      : {}),
    payload,
  };
}

export function baseThread(overrides = {}) {
  return {
    id: "thread-1",
    appKey: "test-app",
    organizationId: "org-1",
    status: "active",
    ...overrides,
  };
}

export function baseTurn(overrides = {}) {
  return {
    id: "turn-1",
    threadId: "thread-1",
    status: "running",
    itemIds: [],
    ...overrides,
  };
}

export function baseSurface(overrides = {}) {
  return {
    id: "surface-1",
    threadId: "thread-1",
    turnId: "turn-1",
    kind: "data.table",
    schemaVersion: 1,
    revision: 1,
    status: "streaming",
    payload: { rows: [{ id: 1 }], page: 1 },
    actions: [
      {
        id: "refresh",
        action: "data.refresh",
        label: "Refresh",
        intent: "primary",
      },
    ],
    ...overrides,
  };
}

export function baseInteraction(overrides = {}) {
  return {
    id: "interaction-1",
    threadId: "thread-1",
    turnId: "turn-1",
    kind: "approval",
    status: "pending",
    title: "Approve change",
    payload: { command: "pnpm test" },
    availableDecisions: ["accept", "decline"],
    createdAt: ISO,
    ...overrides,
  };
}
