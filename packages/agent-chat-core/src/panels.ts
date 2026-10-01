import type { ConfirmLevel, CostThresholds } from "./confirm-policy.js";

/**
 * Modelo de los paneles del chat (SPEC §1 `packages/core`: «modelo de los
 * paneles (Memoria, Plan, BYO)»). Estado de vista puro y determinista:
 * los eventos de negocio llegan ya resueltos por el servidor; aquí solo se
 * reduce el modelo que la UI renderiza.
 */

/* ── Memoria ────────────────────────────────────────────────────────── */

export interface MemoryEntry {
  id: string;
  text: string;
  createdAt: string;
  /** change_id del apply de `memoria.recordar` que la creó, si aplica. */
  sourceChangeId?: string;
  forgottenAt?: string;
}

export interface MemoryPanelState {
  entries: MemoryEntry[];
}

export type MemoryPanelEvent =
  | { type: "entry.recorded"; entry: MemoryEntry }
  | { type: "entry.forgotten"; entryId: string; forgottenAt: string };

export function createMemoryPanel(entries: MemoryEntry[] = []): MemoryPanelState {
  return { entries: [...entries] };
}

export function reduceMemoryPanel(
  state: MemoryPanelState,
  event: MemoryPanelEvent,
): MemoryPanelState {
  switch (event.type) {
    case "entry.recorded": {
      if (state.entries.some((entry) => entry.id === event.entry.id)) {
        return {
          entries: state.entries.map((entry) =>
            entry.id === event.entry.id ? event.entry : entry,
          ),
        };
      }
      return { entries: [...state.entries, event.entry] };
    }
    case "entry.forgotten":
      return {
        entries: state.entries.map((entry) =>
          entry.id === event.entryId ? { ...entry, forgottenAt: event.forgottenAt } : entry,
        ),
      };
  }
}

/** Solo las entradas vigentes (no olvidadas) — lo que ve el modelo. */
export function activeMemoryEntries(state: MemoryPanelState): MemoryEntry[] {
  return state.entries.filter((entry) => entry.forgottenAt === undefined);
}

/* ── Plan ───────────────────────────────────────────────────────────── */

export interface PlanUsage {
  creditsUsed?: number;
  moneyCentsUsed?: number;
  /** Periodo de facturación visible en el panel (p. ej. "2026-09"). */
  period?: string;
}

export type PlanPressure = "normal" | "at_threshold" | "exceeded";

export interface PlanPanelState {
  usage: PlanUsage;
  thresholds: CostThresholds;
  pressure: PlanPressure;
}

/**
 * Deriva el panel del plan: uso del mes + presión de umbral (§1.3, §8).
 * `exceeded` si el uso supera el umbral; `at_threshold` si lo alcanza.
 */
export function derivePlanPanel(
  usage: PlanUsage,
  thresholds: CostThresholds = {},
): PlanPanelState {
  const checks: Array<[number | undefined, number | null | undefined]> = [
    [usage.creditsUsed, thresholds.credits],
    [usage.moneyCentsUsed, thresholds.money_cents],
  ];
  let pressure: PlanPressure = "normal";
  for (const [used, limit] of checks) {
    if (typeof used !== "number" || typeof limit !== "number") continue;
    if (used > limit) pressure = "exceeded";
    else if (used === limit && pressure !== "exceeded") pressure = "at_threshold";
  }
  return { usage: { ...usage }, thresholds: { ...thresholds }, pressure };
}

/* ── BYO ────────────────────────────────────────────────────────────── */

export type ByoKeyStatus = "absent" | "active" | "revoked";

export interface ByoKeyEntry {
  provider: string;
  status: ByoKeyStatus;
  /** Últimos 4 de la clave, solo para mostrar. Nunca la clave. */
  keyLast4?: string;
  addedAt?: string;
  revokedAt?: string;
}

export interface ByoPanelState {
  keys: ByoKeyEntry[];
}

export type ByoPanelEvent =
  | { type: "key.added"; entry: ByoKeyEntry }
  | { type: "key.revoked"; provider: string; revokedAt: string };

export function createByoPanel(keys: ByoKeyEntry[] = []): ByoPanelState {
  return { keys: keys.map((key) => ({ ...key })) };
}

export function reduceByoPanel(state: ByoPanelState, event: ByoPanelEvent): ByoPanelState {
  switch (event.type) {
    case "key.added": {
      const exists = state.keys.some((key) => key.provider === event.entry.provider);
      return {
        keys: exists
          ? state.keys.map((key) => (key.provider === event.entry.provider ? { ...event.entry } : key))
          : [...state.keys, { ...event.entry }],
      };
    }
    case "key.revoked":
      return {
        keys: state.keys.map((key) =>
          key.provider === event.provider
            ? { ...key, status: "revoked", revokedAt: event.revokedAt }
            : key,
        ),
      };
  }
}

/** true si la org tiene alguna clave BYO activa (habilita el plan superior). */
export function hasActiveByoKey(state: ByoPanelState): boolean {
  return state.keys.some((key) => key.status === "active");
}
