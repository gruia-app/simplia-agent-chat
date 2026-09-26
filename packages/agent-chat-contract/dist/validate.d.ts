import type { AuditEvent, ChangeRecord, Proposal, ToolSpec, ViewEvent } from "./generated/types.js";
export declare const CONTRACT_ENTITIES: readonly ["tool-spec", "proposal", "change-record", "audit-event", "view-event"];
export type ContractEntity = (typeof CONTRACT_ENTITIES)[number];
export interface ContractEntityTypes {
    "tool-spec": ToolSpec;
    proposal: Proposal;
    "change-record": ChangeRecord;
    "audit-event": AuditEvent;
    "view-event": ViewEvent;
}
export interface ContractError {
    code: string;
    message: string;
    instancePath: string;
}
export declare class ContractValidationError extends Error {
    readonly errors: readonly ContractError[];
    constructor(entity: ContractEntity, errors: readonly ContractError[]);
}
/**
 * Validación estructural contra el JSON Schema de la entidad.
 * Devuelve la lista de errores (vacía = válido); nunca lanza.
 */
export declare function validateEntity(entity: ContractEntity, document: unknown): ContractError[];
interface ToolSpecShape {
    effect?: unknown;
    confirm?: unknown;
    cost?: {
        kind?: unknown;
        estimator?: unknown;
    };
    undo?: {
        mode?: unknown;
    };
}
/**
 * Reglas cruzadas de SPEC-CHAT-F1-R687 rev 2 §2. Se ejecutan sobre un
 * documento ya válido estructuralmente (validateEntity("tool-spec", doc)).
 */
export declare function validateToolSpecRules(spec: ToolSpecShape): ContractError[];
/** Esquema + reglas cruzadas de §2 para una ToolSpec. */
export declare function validateToolSpec(document: unknown): ContractError[];
interface ChangeRecordShape {
    cost_actual?: unknown;
    cost_unit?: unknown;
}
/**
 * Reglas cruzadas de ChangeRecord (SPEC rev 3): si hay coste real
 * (`cost_actual` numérico), la unidad no puede ser null.
 */
export declare function validateChangeRecordRules(record: ChangeRecordShape): ContractError[];
/** Valida una entidad; tool-spec y change-record incluyen reglas cruzadas. */
export declare function validateContractDocument(entity: ContractEntity, document: unknown): ContractError[];
/** Lanza ContractValidationError si el documento no cumple el contrato. */
export declare function assertContractDocument<E extends ContractEntity>(entity: E, document: unknown): asserts document is ContractEntityTypes[E];
export {};
//# sourceMappingURL=validate.d.ts.map