/**
 * GENERADO — no editar a mano.
 * Fuente: schema/*.schema.json (JSON Schema draft 2020-12, SPEC-CHAT-F1-R687 rev 2).
 * Regenerar: pnpm --filter @simplia/agent-chat-contract run generate
 */
/** Fuente: schema/change-record.schema.json */
export type NonEmptyString = string;
export type Uuid = string;
/**
 * DERIVADO (pendiente de confirmación PLAT): la SPEC-CHAT-F1-R687 rev 2 nombra ChangeRecord pero no lista sus campos. Este conjunto mínimo se deriva de §3/§4: apply → change_id, revert/compensate sobre change_id dentro de undo.window_s, y del enlace con AuditEvent §6 (proposal_id, payload_hash, cost_actual).
 */
export interface ChangeRecord {
    change_id: NonEmptyString;
    proposal_id: Uuid;
    tool: string;
    app_key: string;
    org_id: NonEmptyString;
    user_id: NonEmptyString;
    payload_hash: string;
    applied_at: string;
    state: ("applied" | "reverted" | "compensated");
    /**
     * Copia del ToolSpec.undo.mode vigente al aplicar.
     */
    undo_mode: ("revert" | "compensate" | "none");
    /**
     * Copia del ToolSpec.undo.window_s; revert solo es válido dentro de esta ventana (§3).
     */
    undo_window_s: number;
    /**
     * Marca de tiempo del revert/compensate, o null si el cambio sigue aplicado.
     */
    undone_at: (string | null);
    /**
     * Coste real del apply, para el cost_actual de AuditEvent (§6).
     */
    cost_actual: (number | null);
}
//# sourceMappingURL=change-record.d.ts.map