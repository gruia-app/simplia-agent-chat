/* eslint-disable */
/**
 * GENERADO — no editar a mano.
 * Fuente: schema/*.schema.json (JSON Schema draft 2020-12, SPEC-CHAT-F1-R687 rev 2).
 * Regenerar: pnpm --filter @simplia/agent-chat-contract run generate
 */
/** Fuente: schema/tool-spec.schema.json */
/**
 * SPEC-CHAT-F1-R687 rev 2 §2 (normativo). Las reglas cruzadas effect↔confirm↔undo y cost↔estimator se validan en código (validateToolSpecRules), no en este esquema.
 */
export interface ToolSpec {
name: string
description: string
/**
 * JSON Schema de objeto que describe la entrada de la herramienta.
 */
input_schema: {
[k: string]: unknown | undefined
}
effect: ("read" | "reversible" | "irreversible")
cost: {
kind: ("none" | "credits" | "money")
estimator: boolean
}
confirm: ("none" | "card" | "strong")
undo: {
mode: ("revert" | "compensate" | "none")
window_s: number
grace_s: number
}
/**
 * Clave canónica del registry del kernel.
 */
app_key: string
}
