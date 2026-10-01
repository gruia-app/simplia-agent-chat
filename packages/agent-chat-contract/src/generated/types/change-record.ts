/* eslint-disable */
/**
 * GENERADO — no editar a mano.
 * Fuente: schema/*.schema.json (JSON Schema draft 2020-12, SPEC-CHAT-F1-R687 rev 2).
 * Regenerar: pnpm --filter @simplia/agent-chat-contract run generate
 */
/** Fuente: schema/change-record.schema.json */
export type NonEmptyString = string
export type Uuid = string

/**
 * SPEC-CHAT-F1-R687 rev 3. Registro del cambio aplicado: apply → change_id (§3), revert/compensate sobre change_id dentro de undo.window_s (§3/§4), enlace con AuditEvent §6 (proposal_id, payload_hash, cost_actual, cost_unit).
 */
export interface ChangeRecord {
change_id: NonEmptyString
proposal_id: Uuid
tool: string
app_key: string
org_id: NonEmptyString
user_id: NonEmptyString
payload_hash: string
applied_at: string
state: ("applied" | "reverted" | "compensated")
/**
 * Copia del ToolSpec.undo.mode vigente al aplicar.
 */
undo_mode: ("revert" | "compensate" | "none")
/**
 * Copia del ToolSpec.undo.window_s; revert solo es válido dentro de esta ventana (§3).
 */
undo_window_s: number
/**
 * Marca de tiempo del revert/compensate, o null si el cambio sigue aplicado.
 */
undone_at: (string | null)
/**
 * Coste real del apply, para el cost_actual de AuditEvent (§6).
 */
cost_actual: (number | null)
/**
 * Unidad del coste, coherente con AuditEvent §6. Null si no hubo coste.
 */
cost_unit: (("credits" | "money_cents") | null)
}
