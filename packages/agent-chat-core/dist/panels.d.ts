import type { CostThresholds } from "./confirm-policy.js";
/**
 * Modelo de los paneles del chat (SPEC §1 `packages/core`: «modelo de los
 * paneles (Memoria, Plan, BYO)»). Estado de vista puro y determinista:
 * los eventos de negocio llegan ya resueltos por el servidor; aquí solo se
 * reduce el modelo que la UI renderiza.
 */
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
export type MemoryPanelEvent = {
    type: "entry.recorded";
    entry: MemoryEntry;
} | {
    type: "entry.forgotten";
    entryId: string;
    forgottenAt: string;
};
export declare function createMemoryPanel(entries?: MemoryEntry[]): MemoryPanelState;
export declare function reduceMemoryPanel(state: MemoryPanelState, event: MemoryPanelEvent): MemoryPanelState;
/** Solo las entradas vigentes (no olvidadas) — lo que ve el modelo. */
export declare function activeMemoryEntries(state: MemoryPanelState): MemoryEntry[];
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
export declare function derivePlanPanel(usage: PlanUsage, thresholds?: CostThresholds): PlanPanelState;
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
export type ByoPanelEvent = {
    type: "key.added";
    entry: ByoKeyEntry;
} | {
    type: "key.revoked";
    provider: string;
    revokedAt: string;
};
export declare function createByoPanel(keys?: ByoKeyEntry[]): ByoPanelState;
export declare function reduceByoPanel(state: ByoPanelState, event: ByoPanelEvent): ByoPanelState;
/** true si la org tiene alguna clave BYO activa (habilita el plan superior). */
export declare function hasActiveByoKey(state: ByoPanelState): boolean;
//# sourceMappingURL=panels.d.ts.map