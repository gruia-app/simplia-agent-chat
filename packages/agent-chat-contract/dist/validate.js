import Ajv2020Namespace from "ajv/dist/2020.js";
import addFormatsNamespace from "ajv-formats";
import { SCHEMAS } from "./generated/schemas.js";
export const CONTRACT_ENTITIES = [
    "tool-spec",
    "proposal",
    "change-record",
    "audit-event",
    "view-event",
];
export class ContractValidationError extends Error {
    errors;
    constructor(entity, errors) {
        super(`${entity} failed contract validation: ` +
            errors.map((error) => `${error.code} ${error.instancePath || "/"} ${error.message}`).join("; "));
        this.name = "ContractValidationError";
        this.errors = errors;
    }
}
const Ajv2020 = (Ajv2020Namespace.default ??
    Ajv2020Namespace);
const addFormats = (addFormatsNamespace.default ??
    addFormatsNamespace);
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const compiledValidators = new Map();
for (const entity of CONTRACT_ENTITIES) {
    compiledValidators.set(entity, ajv.compile(SCHEMAS[entity]));
}
function toContractError(error) {
    return {
        code: `schema:${error.keyword}`,
        message: error.message ?? "schema violation",
        instancePath: error.instancePath,
    };
}
/**
 * Validación estructural contra el JSON Schema de la entidad.
 * Devuelve la lista de errores (vacía = válido); nunca lanza.
 */
export function validateEntity(entity, document) {
    const validate = compiledValidators.get(entity);
    if (!validate)
        return [{ code: "schema:unknown_entity", message: `unknown entity ${entity}`, instancePath: "" }];
    return validate(document) ? [] : (validate.errors ?? []).map(toContractError);
}
/**
 * Reglas cruzadas de SPEC-CHAT-F1-R687 rev 2 §2. Se ejecutan sobre un
 * documento ya válido estructuralmente (validateEntity("tool-spec", doc)).
 */
export function validateToolSpecRules(spec) {
    const errors = [];
    const push = (code, message, instancePath) => errors.push({ code, message, instancePath });
    if (spec.effect === "read" && spec.confirm !== "none") {
        push("read_requires_confirm_none", 'effect "read" requires confirm "none"', "/confirm");
    }
    if (spec.effect === "reversible" && spec.confirm !== "card" && spec.confirm !== "strong") {
        push("reversible_requires_card_or_strong", 'effect "reversible" requires confirm "card" or "strong"', "/confirm");
    }
    if (spec.effect === "irreversible") {
        if (spec.confirm !== "strong") {
            push("irreversible_requires_confirm_strong", 'effect "irreversible" requires confirm "strong"', "/confirm");
        }
        if (spec.undo?.mode !== "none" && spec.undo?.mode !== "compensate") {
            push("irreversible_forbids_undo_revert", 'effect "irreversible" requires undo.mode "none" or "compensate"', "/undo/mode");
        }
    }
    if (spec.cost && spec.cost.kind !== "none" && spec.cost.kind !== undefined && spec.cost.estimator !== true) {
        push("cost_kind_requires_estimator", 'cost.kind other than "none" requires estimator true', "/cost/estimator");
    }
    return errors;
}
/** Esquema + reglas cruzadas de §2 para una ToolSpec. */
export function validateToolSpec(document) {
    const schemaErrors = validateEntity("tool-spec", document);
    if (schemaErrors.length > 0)
        return schemaErrors;
    return validateToolSpecRules(document);
}
/** Valida una entidad; para "tool-spec" incluye las reglas cruzadas de §2. */
export function validateContractDocument(entity, document) {
    if (entity === "tool-spec")
        return validateToolSpec(document);
    return validateEntity(entity, document);
}
/** Lanza ContractValidationError si el documento no cumple el contrato. */
export function assertContractDocument(entity, document) {
    const errors = validateContractDocument(entity, document);
    if (errors.length > 0)
        throw new ContractValidationError(entity, errors);
}
//# sourceMappingURL=validate.js.map