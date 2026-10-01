/**
 * Modelo del diff estructurado que devuelve `preview(input)` (SPEC §2:
 * «diff estructurado de campos, texto o filas», sin efectos).
 * El Proposal.preview del contrato es de forma libre; este es el modelo
 * canónico que el paquete propone a las apps para construirlo.
 */
export function fieldsDiff(changes) {
    return { kind: "fields", changes };
}
export function textDiff(hunks) {
    return { kind: "text", hunks };
}
export function rowsDiff(changes) {
    return { kind: "rows", changes };
}
/** true si el diff no contiene ningún cambio (preview vacío). */
export function isEmptyDiff(diff) {
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
export function diffSize(diff) {
    switch (diff.kind) {
        case "fields":
            return diff.changes.length;
        case "text":
            return diff.hunks.length;
        case "rows":
            return diff.changes.length;
    }
}
//# sourceMappingURL=diff-model.js.map