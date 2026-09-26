/**
 * GENERADO — no editar a mano.
 * Fuente: schema/*.schema.json (JSON Schema draft 2020-12, SPEC-CHAT-F1-R687 rev 2).
 * Regenerar: pnpm --filter @simplia/agent-chat-contract run generate
 */
/** Fuente: schema/proposal.schema.json */
export type Uuid = string;
export type NonEmptyString = string;
/**
 * SPEC-CHAT-F1-R687 rev 2 §3 (normativo). Las transiciones de estado válidas se aplican en el servidor (§3); este esquema solo fija la forma del documento.
 */
export interface Proposal {
    id: Uuid;
    tool: string;
    /**
     * Entrada de la herramienta tal como se propuso (forma libre, validada contra el input_schema de la ToolSpec en el servidor).
     */
    input: {
        [k: string]: unknown | undefined;
    };
    /**
     * sha256 del JSON canónico RFC 8785 de {tool, input}.
     */
    payload_hash: string;
    /**
     * Diff estructurado de campos, texto o filas devuelto por preview(input); forma libre.
     */
    preview: {
        [k: string]: unknown | undefined;
    };
    /**
     * Estimación devuelta por estimate(input); forma libre.
     */
    estimate: {
        [k: string]: unknown | undefined;
    };
    /**
     * Confirmación efectiva decidida por el servidor (puede escalar card→strong por umbral de coste, §2).
     */
    confirm_effective: ("none" | "card" | "strong");
    state: ("proposed" | "modified" | "accepted" | "discarded" | "expired" | "applied" | "reverted");
    created_at: string;
    expires_at: string;
    supersedes: (Uuid | null);
    plan_id: (Uuid | null);
    step: (number | null);
    change_id: (NonEmptyString | null);
    org_id: NonEmptyString;
    user_id: NonEmptyString;
    thread_id: NonEmptyString;
}
//# sourceMappingURL=proposal.d.ts.map