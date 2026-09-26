/**
 * GENERADO — no editar a mano.
 * Fuente: schema/*.schema.json (JSON Schema draft 2020-12, SPEC-CHAT-F1-R687 rev 2).
 * Regenerar: pnpm --filter @simplia/agent-chat-contract run generate
 */
/** Fuente: schema/audit-event.schema.json */
export type NonEmptyString = string;
/**
 * SPEC-CHAT-F1-R687 rev 2 §6 (contrato con PLAT, F2). No incluye input, preview ni contenido.
 */
export interface AuditEvent {
    schema_version: 1;
    /**
     * Id de deduplicación para entrega at-least-once (§6).
     */
    event_id: string;
    ts: string;
    org_id: NonEmptyString;
    app_key: string;
    user_id: NonEmptyString;
    tool: string;
    proposal_id: NonEmptyString;
    change_id: (NonEmptyString | null);
    payload_hash: string;
    action: ("proposed" | "accepted" | "applied" | "reverted" | "compensated" | "discarded" | "expired" | "denied");
    confirm_effective: ("none" | "card" | "strong");
    denied_layer: (("entitlement" | "role" | "policy" | "token") | null);
    cost_estimate: number;
    cost_actual: (number | null);
    cost_unit: ("credits" | "money_cents");
    result: ("ok" | "error");
    error_code: (NonEmptyString | null);
}
//# sourceMappingURL=audit-event.d.ts.map