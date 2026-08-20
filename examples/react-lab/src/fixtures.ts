import {
  createInitialChatState,
  type ChatState,
  type JsonValue,
  type PendingInteraction,
  type SurfaceBlock,
} from "simplia-agent-chat/core";

export type LabFixtureKey = "acv2" | "contenido" | "data";

interface LabFixture {
  key: LabFixtureKey;
  label: string;
  description: string;
  threadId: string;
  state: ChatState;
}

const threadIdByFixture: Record<LabFixtureKey, string> = {
  acv2: "thread-acv2",
  contenido: "thread-contenido",
  data: "thread-data",
};

function baseFixture(
  key: LabFixtureKey,
  title: string,
  items: ChatState["items"],
  surfaces: SurfaceBlock[],
  interactions: PendingInteraction[],
): ChatState {
  const state = createInitialChatState();
  const threadId = threadIdByFixture[key];
  const turnId = `turn-${key}`;
  return {
    ...state,
    threads: {
      [threadId]: {
        id: threadId,
        appKey: key,
        organizationId: "simplia-lab",
        title,
        status: interactions.some((entry) => entry.kind === "approval")
          ? "waiting_approval"
          : interactions.length > 0
            ? "waiting_input"
            : "active",
        provider: { provider: key === "data" ? "openrouter" : "codex", model: "gpt-5.6-codex" },
      },
    },
    turns: {
      [turnId]: {
        id: turnId,
        threadId,
        status: interactions.length > 0 ? "waiting_input" : "running",
        itemIds: Object.keys(items),
        startedAt: "2026-08-13T10:00:00.000Z",
      },
    },
    items,
    surfaces: Object.fromEntries(surfaces.map((surface) => [surface.id, surface])),
    interactions: Object.fromEntries(interactions.map((entry) => [entry.id, entry])),
  };
}

const acv2Thread = threadIdByFixture.acv2;
const contenidoThread = threadIdByFixture.contenido;
const dataThread = threadIdByFixture.data;

export const CHAT_LAB_FIXTURES: Record<LabFixtureKey, LabFixture> = {
  acv2: {
    key: "acv2",
    label: "ACV2",
    description: "Execution plans, permissions and deployment evidence",
    threadId: acv2Thread,
    state: baseFixture(
      "acv2",
      "Release evidence review",
      {
        "acv2-user": {
          id: "acv2-user",
          threadId: acv2Thread,
          turnId: "turn-acv2",
          kind: "message",
          status: "completed",
          role: "user",
          text: "Verify the exact release SHA and prepare the production evidence gate.",
        },
        "acv2-reasoning": {
          id: "acv2-reasoning",
          threadId: acv2Thread,
          turnId: "turn-acv2",
          kind: "reasoning",
          status: "completed",
          role: "assistant",
          text: "I separated Jenkins result, served SHA, health and smoke into independent evidence checks.",
        },
        "acv2-command": {
          id: "acv2-command",
          threadId: acv2Thread,
          turnId: "turn-acv2",
          kind: "command",
          status: "completed",
          title: "Read deploy status",
          text: "GET /api/v1/deploy-status/latest",
          output: { status: 200, served_sha: "d00e2ff", health: "ok" },
        },
      },
      [
        {
          id: "surface-acv2-evidence",
          threadId: acv2Thread,
          turnId: "turn-acv2",
          kind: "acv2.deployment-evidence",
          schemaVersion: 1,
          revision: 3,
          status: "action_required",
          presentation: { title: "Production evidence", density: "compact", preferredSurface: "inline" },
          payload: {
            releaseSha: "d00e2ffff842",
            checks: [
              { label: "Jenkins", value: "passed", state: "ok" },
              { label: "Served SHA", value: "d00e2ff", state: "ok" },
              { label: "Browser smoke", value: "awaiting approval", state: "warning" },
            ],
          },
          actions: [
            { id: "open-evidence", action: "deployment.open_evidence", label: "Open evidence", intent: "neutral" },
            { id: "approve-smoke", action: "deployment.approve_smoke", label: "Approve smoke", intent: "primary" },
          ],
        },
      ],
      [
        {
          id: "interaction-acv2-approval",
          threadId: acv2Thread,
          turnId: "turn-acv2",
          kind: "approval",
          status: "pending",
          title: "Run authenticated production smoke?",
          description: "This is a read-only smoke against the served release and will be written to the audit trail.",
          payload: { scope: "production", command: "deploy-smoke" },
          availableDecisions: ["Approve once", "Deny"],
        },
      ],
    ),
  },
  contenido: {
    key: "contenido",
    label: "CONTENIDO",
    description: "Publication draft opens in the artifact stage",
    threadId: contenidoThread,
    state: baseFixture(
      "contenido",
      "Campaign publication review",
      {
        "contenido-user": {
          id: "contenido-user",
          threadId: contenidoThread,
          turnId: "turn-contenido",
          kind: "message",
          status: "completed",
          role: "user",
          text: "Prepare the LinkedIn publication and keep the video cut under 45 seconds.",
        },
        "contenido-assistant": {
          id: "contenido-assistant",
          threadId: contenidoThread,
          turnId: "turn-contenido",
          kind: "message",
          status: "completed",
          role: "assistant",
          text: "The draft is ready. I need the editorial angle before scheduling it.",
        },
      },
      [
        {
          id: "surface-publication",
          threadId: contenidoThread,
          turnId: "turn-contenido",
          kind: "contenido.publication",
          schemaVersion: 1,
          revision: 1,
          status: "ready",
          presentation: { title: "LinkedIn draft", density: "comfortable", preferredSurface: "panel" },
          payload: {
            channel: "LinkedIn",
            headline: "From backlog to verified release",
            body: "Shipping autonomous software is not the same as proving it runs. We keep build, deployment and served behavior as separate evidence layers.",
            media: ["cover-release-evidence.png", "smoke-check.mp4"],
          },
          actions: [
            { id: "edit-publication", action: "publication.edit", label: "Edit draft", intent: "neutral" },
            { id: "schedule-publication", action: "publication.schedule", label: "Schedule", intent: "primary" },
          ],
        },
      ],
      [
        {
          id: "interaction-contenido-question",
          threadId: contenidoThread,
          turnId: "turn-contenido",
          kind: "question",
          status: "pending",
          title: "Which editorial angle should lead?",
          description: "Choose a concise framing for the first two lines of the post.",
          payload: { field: "editorial_angle" },
          availableDecisions: ["Operational proof", "Founder lesson", "Technical walkthrough"],
        },
      ],
    ),
  },
  data: {
    key: "data",
    label: "DATA",
    description: "Metrics, tables and chart-ready analytical surfaces",
    threadId: dataThread,
    state: baseFixture(
      "data",
      "Dispatch capacity analysis",
      {
        "data-user": {
          id: "data-user",
          threadId: dataThread,
          turnId: "turn-data",
          kind: "message",
          status: "completed",
          role: "user",
          text: "Compare queued work with effective worker capacity for the last six readings.",
        },
        "data-tool": {
          id: "data-tool",
          threadId: dataThread,
          turnId: "turn-data",
          kind: "tool",
          status: "completed",
          title: "Query operational metrics",
          toolName: "analytics.query",
          output: { rows: 6, source: "worker_capacity_readings" },
        },
      },
      [
        {
          id: "surface-data-chart",
          threadId: dataThread,
          turnId: "turn-data",
          kind: "data.capacity-chart",
          schemaVersion: 1,
          revision: 2,
          status: "completed",
          presentation: { title: "Queue vs effective capacity", density: "expanded", preferredSurface: "inline" },
          payload: {
            series: [
              { label: "09:00", queued: 266, capacity: 0 },
              { label: "09:10", queued: 259, capacity: 2 },
              { label: "09:20", queued: 244, capacity: 3 },
              { label: "09:30", queued: 221, capacity: 3 },
              { label: "09:40", queued: 204, capacity: 4 },
              { label: "09:50", queued: 188, capacity: 4 },
            ],
            source: "canonical worker capacity readings",
          },
          actions: [
            { id: "open-table", action: "data.open_table", label: "Open table", intent: "neutral" },
            { id: "export-csv", action: "data.export_csv", label: "Export CSV", intent: "neutral" },
          ],
        },
      ],
      [],
    ),
  },
};

export function appendFixtureUserMessage(state: ChatState, threadId: string, text: string): ChatState {
  const turns = Object.values(state.turns).filter((turn) => turn.threadId === threadId);
  const turn = turns[turns.length - 1];
  if (!turn) return state;
  const itemId = `lab-user-${Date.now()}`;
  return {
    ...state,
    turns: { ...state.turns, [turn.id]: { ...turn, itemIds: [...turn.itemIds, itemId] } },
    items: {
      ...state.items,
      [itemId]: {
        id: itemId,
        threadId,
        turnId: turn.id,
        kind: "message",
        status: "completed",
        role: "user",
        text,
      },
    },
  };
}

export function resolveFixtureInteraction(
  state: ChatState,
  interaction: PendingInteraction,
  resolution: JsonValue,
): ChatState {
  return {
    ...state,
    interactions: {
      ...state.interactions,
      [interaction.id]: {
        ...interaction,
        status: "resolved",
        resolution,
        resolvedAt: new Date().toISOString(),
      },
    },
  };
}
