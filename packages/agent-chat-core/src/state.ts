import type {
  ChatEvent,
  ChatItem,
  ChatThread,
  ChatTurn,
  ChatUsage,
  PendingInteraction,
  SurfaceBlock,
  SurfacePatch,
} from "./protocol.js";

const MAX_SEEN_EVENT_IDS = 50_000;
const MAX_WARNINGS = 1_000;

export interface ResyncRequest {
  streamId: string;
  expectedSequence: number;
  receivedSequence: number;
  eventId: string;
}

export interface ChatState {
  threads: Record<string, ChatThread>;
  turns: Record<string, ChatTurn>;
  items: Record<string, ChatItem>;
  surfaces: Record<string, SurfaceBlock>;
  interactions: Record<string, PendingInteraction>;
  usageByThread: Record<string, ChatUsage>;
  streamSequences: Record<string, number>;
  seenEventIds: string[];
  resyncRequests: Record<string, ResyncRequest>;
  warnings: Array<{ code: string; message: string; eventId: string }>;
}

export interface ReduceResult {
  state: ChatState;
  applied: boolean;
  reason?: "duplicate" | "stale_stream_event" | "stream_gap" | "surface_conflict" | "invalid_turn_transition";
}

const TERMINAL_TURN_STATUSES = new Set(["completed", "failed", "interrupted", "cancelled"]);

export function createInitialChatState(): ChatState {
  return {
    threads: {},
    turns: {},
    items: {},
    surfaces: {},
    interactions: {},
    usageByThread: {},
    streamSequences: {},
    seenEventIds: [],
    resyncRequests: {},
    warnings: [],
  };
}

function rememberEvent(state: ChatState, eventId: string): ChatState {
  const seenEventIds = [...state.seenEventIds, eventId];
  if (seenEventIds.length > MAX_SEEN_EVENT_IDS) {
    seenEventIds.splice(0, seenEventIds.length - MAX_SEEN_EVENT_IDS);
  }
  return { ...state, seenEventIds };
}

function withStreamSequence(state: ChatState, event: ChatEvent): ChatState {
  if (!event.stream) return state;
  return {
    ...state,
    streamSequences: { ...state.streamSequences, [event.stream.id]: event.stream.sequence },
    resyncRequests: Object.fromEntries(
      Object.entries(state.resyncRequests).filter(([streamId]) => streamId !== event.stream?.id),
    ),
  };
}

function patchSurface(surface: SurfaceBlock, patch: SurfacePatch): SurfaceBlock {
  const current = surface.payload;
  let payload = patch.payload;
  if (patch.operation === "merge" && isRecord(current) && isRecord(patch.payload)) {
    payload = { ...current, ...patch.payload };
  } else if (patch.operation === "append_page") {
    const currentRecord = isRecord(current) ? current : {};
    const patchRecord = isRecord(patch.payload) ? patch.payload : {};
    const currentRows = Array.isArray(currentRecord.rows) ? currentRecord.rows : [];
    const nextRows = Array.isArray(patchRecord.rows) ? patchRecord.rows : [];
    payload = { ...currentRecord, ...patchRecord, rows: [...currentRows, ...nextRows] };
  }
  const status = patch.operation === "complete"
    ? "completed"
    : patch.operation === "fail"
      ? "failed"
      : surface.status;
  return { ...surface, revision: patch.revision, payload, status };
}

function isRecord(value: unknown): value is Record<string, import("./protocol.js").JsonValue> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function applyEvent(state: ChatState, event: ChatEvent): ReduceResult {
  switch (event.type) {
    case "thread.snapshot": {
      const snapshot = event.payload;
      const staleTurnIds = new Set(
        Object.values(state.turns)
          .filter((turn) => turn.threadId === snapshot.thread.id)
          .map((turn) => turn.id),
      );
      const turns = Object.fromEntries(
        Object.entries(state.turns).filter(([, turn]) => turn.threadId !== snapshot.thread.id),
      );
      const items = Object.fromEntries(
        Object.entries(state.items).filter(([, item]) => item.threadId !== snapshot.thread.id && !staleTurnIds.has(item.turnId)),
      );
      const surfaces = Object.fromEntries(
        Object.entries(state.surfaces).filter(([, surface]) => surface.threadId !== snapshot.thread.id),
      );
      const interactions = Object.fromEntries(
        Object.entries(state.interactions).filter(([, interaction]) => interaction.threadId !== snapshot.thread.id),
      );
      for (const turn of snapshot.turns) turns[turn.id] = turn;
      for (const item of snapshot.items) items[item.id] = item;
      for (const surface of snapshot.surfaces) surfaces[surface.id] = surface;
      for (const interaction of snapshot.interactions) interactions[interaction.id] = interaction;
      return {
        applied: true,
        state: {
          ...state,
          threads: { ...state.threads, [snapshot.thread.id]: snapshot.thread },
          turns,
          items,
          surfaces,
          interactions,
          ...(snapshot.usage
            ? { usageByThread: { ...state.usageByThread, [snapshot.thread.id]: snapshot.usage } }
            : {}),
        },
      };
    }
    case "thread.upsert":
      return { applied: true, state: { ...state, threads: { ...state.threads, [event.payload.id]: event.payload } } };
    case "turn.upsert":
      return { applied: true, state: { ...state, turns: { ...state.turns, [event.payload.id]: event.payload } } };
    case "turn.status": {
      const turnId = event.turnId;
      if (!turnId) return { applied: true, state };
      const current = state.turns[turnId] ?? {
        id: turnId,
        threadId: event.threadId,
        itemIds: [],
        status: event.payload.status,
      };
      if (TERMINAL_TURN_STATUSES.has(current.status) && current.status !== event.payload.status) {
        return { applied: false, state, reason: "invalid_turn_transition" };
      }
      const next: ChatTurn = { ...current, ...event.payload };
      return { applied: true, state: { ...state, turns: { ...state.turns, [turnId]: next } } };
    }
    case "item.upsert": {
      const item = event.payload;
      const previousItem = state.items[item.id];
      const nextItem: ChatItem = previousItem && item.kind === "tool" && previousItem.kind === "tool"
        ? {
            ...previousItem,
            ...item,
            ...(previousItem.toolName && !item.toolName ? { toolName: previousItem.toolName } : {}),
            ...(isRecord(previousItem.input) && isRecord(item.input)
              ? {
                  input: {
                    ...previousItem.input,
                    ...item.input,
                    ...(typeof previousItem.input.arguments === "string" && typeof item.input.arguments === "string"
                      ? { arguments: `${previousItem.input.arguments}${item.input.arguments}` }
                      : {}),
                    ...(previousItem.input.toolCallId
                      ? { toolCallId: previousItem.input.toolCallId }
                      : {}),
                  },
                }
              : {}),
          }
        : item;
      const turn = state.turns[item.turnId];
      const turns = turn && !turn.itemIds.includes(item.id)
        ? { ...state.turns, [turn.id]: { ...turn, itemIds: [...turn.itemIds, item.id] } }
        : state.turns;
      return { applied: true, state: { ...state, turns, items: { ...state.items, [item.id]: nextItem } } };
    }
    case "item.delta": {
      const current = state.items[event.payload.itemId] ?? {
        id: event.payload.itemId,
        threadId: event.threadId,
        turnId: event.turnId ?? "unknown",
        kind: "message" as const,
        role: "assistant" as const,
        status: "streaming" as const,
        text: "",
      };
      const next = event.payload.field === "output"
        ? { ...current, output: `${typeof current.output === "string" ? current.output : ""}${event.payload.delta}` }
        : { ...current, text: `${current.text ?? ""}${event.payload.delta}` };
      return { applied: true, state: { ...state, items: { ...state.items, [current.id]: next } } };
    }
    case "interaction.requested":
      return {
        applied: true,
        state: { ...state, interactions: { ...state.interactions, [event.payload.id]: event.payload } },
      };
    case "interaction.resolved": {
      const current = state.interactions[event.payload.interactionId];
      if (!current) return { applied: true, state };
      const next: PendingInteraction = {
        ...current,
        status: "resolved",
        ...(event.payload.resolution !== undefined ? { resolution: event.payload.resolution } : {}),
        ...(event.payload.resolvedAt ? { resolvedAt: event.payload.resolvedAt } : {}),
      };
      return {
        applied: true,
        state: { ...state, interactions: { ...state.interactions, [current.id]: next } },
      };
    }
    case "surface.upsert": {
      const current = state.surfaces[event.payload.id];
      if (current && event.payload.revision < current.revision) {
        return { applied: false, state, reason: "surface_conflict" };
      }
      return { applied: true, state: { ...state, surfaces: { ...state.surfaces, [event.payload.id]: event.payload } } };
    }
    case "surface.patch": {
      const current = state.surfaces[event.payload.surfaceId];
      if (!current || current.revision !== event.payload.baseRevision) {
        return { applied: false, state, reason: "surface_conflict" };
      }
      const next = patchSurface(current, event.payload);
      return { applied: true, state: { ...state, surfaces: { ...state.surfaces, [next.id]: next } } };
    }
    case "usage.updated":
      return {
        applied: true,
        state: {
          ...state,
          usageByThread: {
            ...state.usageByThread,
            [event.threadId]: { ...state.usageByThread[event.threadId], ...event.payload },
          },
        },
      };
    case "warning":
      return {
        applied: true,
        state: {
          ...state,
          warnings: [
            ...state.warnings,
            { code: event.payload.code, message: event.payload.message, eventId: event.id },
          ].slice(-MAX_WARNINGS),
        },
      };
  }
}

export function reduceChatEvent(state: ChatState, event: ChatEvent): ReduceResult {
  if (state.seenEventIds.includes(event.id)) return { state, applied: false, reason: "duplicate" };

  if (event.stream) {
    const previous = state.streamSequences[event.stream.id];
    if (previous !== undefined && event.stream.sequence <= previous) {
      return { state, applied: false, reason: "stale_stream_event" };
    }
    if (previous !== undefined && event.stream.sequence > previous + 1) {
      return {
        applied: false,
        reason: "stream_gap",
        state: {
          ...state,
          resyncRequests: {
            ...state.resyncRequests,
            [event.stream.id]: {
              streamId: event.stream.id,
              expectedSequence: previous + 1,
              receivedSequence: event.stream.sequence,
              eventId: event.id,
            },
          },
        },
      };
    }
  }

  const result = applyEvent(state, event);
  if (!result.applied) return result;
  return {
    applied: true,
    state: rememberEvent(withStreamSequence(result.state, event), event.id),
  };
}

export function replayChatEvents(events: Iterable<ChatEvent>, initial = createInitialChatState()): ChatState {
  let state = initial;
  for (const event of events) state = reduceChatEvent(state, event).state;
  return state;
}

export function selectThreadTurns(state: ChatState, threadId: string): ChatTurn[] {
  return Object.values(state.turns)
    .filter((turn) => turn.threadId === threadId)
    .sort((a, b) => (a.startedAt ?? a.id).localeCompare(b.startedAt ?? b.id));
}

export function selectTurnItems(state: ChatState, turnId: string): ChatItem[] {
  const turn = state.turns[turnId];
  if (!turn) return [];
  return turn.itemIds.flatMap((id) => state.items[id] ? [state.items[id]] : []);
}

export function selectPendingInteraction(state: ChatState, threadId: string): PendingInteraction | undefined {
  return Object.values(state.interactions).find(
    (interaction) => interaction.threadId === threadId && interaction.status === "pending",
  );
}
