import Ajv2020Namespace from "ajv/dist/2020.js";
import addFormatsNamespace from "ajv-formats";
import type { ErrorObject, ValidateFunction } from "ajv";

import { SCHEMAS } from "./generated/schemas.js";
import type {
  AuditEvent,
  ChangeRecord,
  Proposal,
  ProposalRef,
  ToolSpec,
  ViewEvent,
} from "./generated/types.js";

export const CONTRACT_ENTITIES = [
  "tool-spec",
  "proposal",
  "change-record",
  "audit-event",
  "view-event",
  "proposal-ref",
] as const;

export type ContractEntity = (typeof CONTRACT_ENTITIES)[number];

export interface ContractEntityTypes {
  "tool-spec": ToolSpec;
  proposal: Proposal;
  "change-record": ChangeRecord;
  "audit-event": AuditEvent;
  "view-event": ViewEvent;
  "proposal-ref": ProposalRef;
}

export interface ContractError {
  code: string;
  message: string;
  instancePath: string;
}

export class ContractValidationError extends Error {
  readonly errors: readonly ContractError[];

  constructor(entity: ContractEntity, errors: readonly ContractError[]) {
    super(
      `${entity} failed contract validation: ` +
        errors.map((error) => `${error.code} ${error.instancePath || "/"} ${error.message}`).join("; "),
    );
    this.name = "ContractValidationError";
    this.errors = errors;
  }
}

// CJS interop under NodeNext: the default binding types as the module
// namespace; at runtime it is the exported function itself (self-referential
// `.default`), so unwrap defensively.
type Ajv2020Ctor = typeof Ajv2020Namespace.default;
const Ajv2020: Ajv2020Ctor =
  ((Ajv2020Namespace as unknown as { default?: Ajv2020Ctor }).default ??
    Ajv2020Namespace) as Ajv2020Ctor;
type AddFormats = typeof addFormatsNamespace.default;
const addFormats: AddFormats =
  ((addFormatsNamespace as unknown as { default?: AddFormats }).default ??
    addFormatsNamespace) as AddFormats;

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);

const compiledValidators = new Map<ContractEntity, ValidateFunction>();
for (const entity of CONTRACT_ENTITIES) {
  compiledValidators.set(entity, ajv.compile(SCHEMAS[entity]));
}

function toContractError(error: ErrorObject): ContractError {
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
export function validateEntity(entity: ContractEntity, document: unknown): ContractError[] {
  const validate = compiledValidators.get(entity);
  if (!validate) return [{ code: "schema:unknown_entity", message: `unknown entity ${entity}`, instancePath: "" }];
  return validate(document) ? [] : (validate.errors ?? []).map(toContractError);
}

interface ToolSpecShape {
  name?: unknown;
  app_key?: unknown;
  effect?: unknown;
  confirm?: unknown;
  cost?: { kind?: unknown; estimator?: unknown };
  undo?: { mode?: unknown };
  output_schema?: unknown;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((item, i) => deepEqual(item, b[i]))
    );
  }
  if (typeof a === "object") {
    const ao = a as Record<string, unknown>;
    const bo = b as Record<string, unknown>;
    const keys = Object.keys(ao);
    return (
      keys.length === Object.keys(bo).length &&
      keys.every((k) => k in bo && deepEqual(ao[k], bo[k]))
    );
  }
  return false;
}

/**
 * Reglas cruzadas de SPEC-CHAT-F1-R687 §2 (rev 2: effect↔confirm↔undo,
 * cost↔estimator; rev 4: output_schema; rev 5: restricción de nombres
 * para la proyección MCP de §9). Se ejecutan sobre un documento ya
 * válido estructuralmente (validateEntity("tool-spec", doc)).
 */
export function validateToolSpecRules(spec: ToolSpecShape): ContractError[] {
  const errors: ContractError[] = [];
  const push = (code: string, message: string, instancePath: string) =>
    errors.push({ code, message, instancePath });

  // --- rev 5 §2: restricción de nombres para la proyección MCP (§9.1) ---
  const name = typeof spec.name === "string" ? spec.name : "";
  const appKey = typeof spec.app_key === "string" ? spec.app_key : "";
  const [ns = "", verb = ""] = name.split(".");
  if (appKey.includes("__") || ns.includes("__") || verb.includes("__")) {
    push(
      "forbidden_double_underscore",
      '"__" is forbidden inside app_key, ns and verb (MCP projection separator)',
      "/name",
    );
  }
  if (ns === "proposal") {
    push(
      "reserved_namespace_proposal",
      'namespace "proposal" is reserved for system tools (§9.3)',
      "/name",
    );
  }
  const projection = `${appKey}__${ns}__${verb}`;
  if (appKey && name && projection.length > 64) {
    push(
      "mcp_projection_too_long",
      "MCP projection <app_key>__<ns>__<verb> exceeds 64 characters",
      "/name",
    );
  }

  // --- rev 4 §2: output_schema ---
  const proposalRefSchema = SCHEMAS["proposal-ref"] as unknown;
  if (spec.effect === "read" && spec.output_schema === undefined) {
    push(
      "read_requires_output_schema",
      'effect "read" requires output_schema',
      "/output_schema",
    );
  }
  if (
    spec.effect !== undefined &&
    spec.effect !== "read" &&
    (spec.output_schema === undefined || !deepEqual(spec.output_schema, proposalRefSchema))
  ) {
    push(
      "write_requires_proposal_ref_output",
      'write tools must use the ProposalRef schema as output_schema',
      "/output_schema",
    );
  }

  if (spec.effect === "read" && spec.confirm !== "none") {
    push("read_requires_confirm_none", 'effect "read" requires confirm "none"', "/confirm");
  }
  if (spec.effect === "reversible" && spec.confirm !== "card" && spec.confirm !== "strong") {
    push(
      "reversible_requires_card_or_strong",
      'effect "reversible" requires confirm "card" or "strong"',
      "/confirm",
    );
  }
  if (spec.effect === "irreversible") {
    if (spec.confirm !== "strong") {
      push(
        "irreversible_requires_confirm_strong",
        'effect "irreversible" requires confirm "strong"',
        "/confirm",
      );
    }
    if (spec.undo?.mode !== "none" && spec.undo?.mode !== "compensate") {
      push(
        "irreversible_forbids_undo_revert",
        'effect "irreversible" requires undo.mode "none" or "compensate"',
        "/undo/mode",
      );
    }
  }
  if (spec.cost && spec.cost.kind !== "none" && spec.cost.kind !== undefined && spec.cost.estimator !== true) {
    push("cost_kind_requires_estimator", 'cost.kind other than "none" requires estimator true', "/cost/estimator");
  }
  return errors;
}

/** Esquema + reglas cruzadas de §2 para una ToolSpec. */
export function validateToolSpec(document: unknown): ContractError[] {
  const schemaErrors = validateEntity("tool-spec", document);
  if (schemaErrors.length > 0) return schemaErrors;
  return validateToolSpecRules(document as ToolSpecShape);
}

interface ChangeRecordShape {
  cost_actual?: unknown;
  cost_unit?: unknown;
}

/**
 * Reglas cruzadas de ChangeRecord (SPEC rev 3): si hay coste real
 * (`cost_actual` numérico), la unidad no puede ser null.
 */
export function validateChangeRecordRules(record: ChangeRecordShape): ContractError[] {
  const errors: ContractError[] = [];
  if (typeof record.cost_actual === "number" && record.cost_unit === null) {
    errors.push({
      code: "cost_actual_requires_cost_unit",
      message: "cost_actual requires a non-null cost_unit",
      instancePath: "/cost_unit",
    });
  }
  return errors;
}

/** Valida una entidad; tool-spec y change-record incluyen reglas cruzadas. */
export function validateContractDocument(entity: ContractEntity, document: unknown): ContractError[] {
  if (entity === "tool-spec") return validateToolSpec(document);
  const schemaErrors = validateEntity(entity, document);
  if (schemaErrors.length > 0) return schemaErrors;
  if (entity === "change-record") {
    return validateChangeRecordRules(document as ChangeRecordShape);
  }
  return [];
}

/** Lanza ContractValidationError si el documento no cumple el contrato. */
export function assertContractDocument<E extends ContractEntity>(
  entity: E,
  document: unknown,
): asserts document is ContractEntityTypes[E] {
  const errors = validateContractDocument(entity, document);
  if (errors.length > 0) throw new ContractValidationError(entity, errors);
}
