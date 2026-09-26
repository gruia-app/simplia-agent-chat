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

export type StructuredDiff =
  | { kind: "fields"; changes: FieldChange[] }
  | { kind: "text"; hunks: TextHunk[] }
  | { kind: "rows"; changes: RowChange[] };

export function fieldsDiff(changes: FieldChange[]): StructuredDiff {
  return { kind: "fields", changes };
}

export function textDiff(hunks: TextHunk[]): StructuredDiff {
  return { kind: "text", hunks };
}

export function rowsDiff(changes: RowChange[]): StructuredDiff {
  return { kind: "rows", changes };
}

/** true si el diff no contiene ningún cambio (preview vacío). */
export function isEmptyDiff(diff: StructuredDiff): boolean {
  switch (diff.kind) {
    case "fields":
      return diff.changes.length === 0;
    case "text":
      return diff.hunks.length === 0;
    case "rows":
      return diff.changes.length === 0;
  }
}

/** Número total de cambios del diff (para resúmenes de la tarjeta). */
export function diffSize(diff: StructuredDiff): number {
  switch (diff.kind) {
    case "fields":
      return diff.changes.length;
    case "text":
      return diff.hunks.length;
    case "rows":
      return diff.changes.length;
  }
}
