/**
 * GENERADO — no editar a mano.
 * Fuente: schema/*.schema.json (JSON Schema draft 2020-12, SPEC-CHAT-F1-R687 rev 2).
 * Regenerar: pnpm --filter @simplia/agent-chat-contract run generate
 */
/** Fuente: schema/view-event.schema.json */
export type NonEmptyString = string;
/**
 * SPEC-CHAT-F1-R687 rev 3. Eventos breves del contexto de la vista clásica: la selección actual y los cambios manuales recientes (M-CHAT-CENTRIC §1.1/§1.5). Nunca volcados completos.
 */
export interface ViewEvent {
    event_id: NonEmptyString;
    ts: string;
    /**
     * selection = selección actual de la vista clásica; manual_edit = cambio manual reciente (M §1.1, §1.5).
     */
    kind: ("selection" | "manual_edit");
    /**
     * Identificador de la vista clásica que emite el evento.
     */
    view: string;
    /**
     * Elemento afectado dentro de la vista (p. ej. «paso 2»), o null.
     */
    target: (NonEmptyString | null);
    /**
     * Descripción breve para el contexto del modelo («has cambiado el asunto del paso 2»). Nunca un volcado completo.
     */
    summary: string;
    thread_id: NonEmptyString;
    org_id: NonEmptyString;
    user_id: NonEmptyString;
}
//# sourceMappingURL=view-event.d.ts.map