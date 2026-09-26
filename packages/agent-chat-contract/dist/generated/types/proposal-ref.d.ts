/**
 * GENERADO — no editar a mano.
 * Fuente: schema/*.schema.json (JSON Schema draft 2020-12, SPEC-CHAT-F1-R687 rev 2).
 * Regenerar: pnpm --filter @simplia/agent-chat-contract run generate
 */
/** Fuente: schema/proposal-ref.schema.json */
/**
 * SPEC-CHAT-F1-R687 rev 4/5 §9.2: structuredContent que devuelve una herramienta de escritura proyectada a MCP. review_url lleva SOLO el proposal_id, nunca un token.
 */
export interface ProposalRef {
    proposal_id: string;
    tool: string;
    /**
     * Diff estructurado (preview) sin efectos.
     */
    diff: {
        [k: string]: unknown | undefined;
    };
    estimate: ({
        [k: string]: unknown | undefined;
    } | number | null);
    confirm_effective: ("none" | "card" | "strong");
    effect: ("read" | "reversible" | "irreversible");
    expires_at: string;
    review_url: string;
}
//# sourceMappingURL=proposal-ref.d.ts.map