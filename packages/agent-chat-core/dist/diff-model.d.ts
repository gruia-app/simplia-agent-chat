/**
 * Modelo del diff estructurado que devuelve `preview(input)` (SPEC §2:
 * «diff estructurado de campos, texto o filas», sin efectos).
 * El Proposal.preview del contrato es de forma libre; este es el modelo
 * canónico que el paquete propone a las apps para construirlo.
 */
export type DiffOp = "add" | "remove" | "replace";
export interface FieldChange {
    /** JSON Pointer al campo dentro del recurso afectado. */
    path: string;
    op: DiffOp;
    before?: unknown;
    after?: unknown;
}
export interface TextHunk {
    /** Identificador del bloque de texto (p. ej. campo o sección). */
    path: string;
    /** Diff unificado o marcado propio de la app. */
    before: string;
    after: string;
}
export interface RowChange {
    /** Colección/tabla afectada. */
    table: string;
    /** Clave de la fila afectada. */
    key: string;
    op: DiffOp;
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
}
export type StructuredDiff = {
    kind: "fields";
    changes: FieldChange[];
} | {
    kind: "text";
    hunks: TextHunk[];
} | {
    kind: "rows";
    changes: RowChange[];
};
export declare function fieldsDiff(changes: FieldChange[]): StructuredDiff;
export declare function textDiff(hunks: TextHunk[]): StructuredDiff;
export declare function rowsDiff(changes: RowChange[]): StructuredDiff;
/** true si el diff no contiene ningún cambio (preview vacío). */
export declare function isEmptyDiff(diff: StructuredDiff): boolean;
/** Número total de cambios del diff (para resúmenes de la tarjeta). */
export declare function diffSize(diff: StructuredDiff): number;
//# sourceMappingURL=diff-model.d.ts.map