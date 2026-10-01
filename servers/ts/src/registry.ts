/** Registro de herramientas (§1/§2): ToolSpec validada + implementación
 * por la app. §4 «cero parseo de texto libre»: el registro nunca acepta
 * acciones como texto del modelo — solo ToolSpec + input estructurado.
 */

import Ajv2020Namespace from "ajv/dist/2020.js";
import addFormatsNamespace from "ajv-formats";
import type { ErrorObject, ValidateFunction } from "ajv";

import {
  validateContractDocument,
  type ContractError,
  type ToolSpec,
} from "@simplia/agent-chat-contract";

import { badRequest, unprocessable } from "./errors.js";

// Interop CJS/ESM igual que en agent-chat-contract (ver src/validate.ts allí).
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

export interface InputValidationError {
  code: string;
  message: string;
  path: string;
}

export interface ToolImplementation {
  /** Estimador de coste (obligatorio si cost.estimator). */
  estimate(input: Record<string, unknown>): unknown;
  /** Preview: diff estructurado y sin efectos. */
  preview(input: Record<string, unknown>): unknown;
  /** Ejecuta y devuelve change_id. idempotencyKey = proposal_id (§4). */
  apply(input: Record<string, unknown>, idempotencyKey: string): string | Promise<string>;
  revert(changeId: string): void | Promise<void>;
  compensate(changeId: string): void | Promise<void>;
}

export class ToolRegistry {
  private readonly tools = new Map<string, { spec: ToolSpec; impl: ToolImplementation; inputValidator: ValidateFunction }>();

  register(toolspec: ToolSpec, implementation: ToolImplementation): void {
    const errors = validateContractDocument("tool-spec", toolspec);
    if (errors.length > 0) {
      throw unprocessable(
        `invalid toolspec: ${errors[0]!.code} ${errors[0]!.message}`,
        "invalid_toolspec",
      );
    }
    this.tools.set(toolspec.name, {
      spec: toolspec,
      impl: implementation,
      inputValidator: ajv.compile(toolspec.input_schema as Record<string, unknown>),
    });
  }

  get(name: string): { spec: ToolSpec; impl: ToolImplementation } {
    const entry = this.tools.get(name);
    if (!entry) throw badRequest(`unknown tool ${name}`, "unknown_tool");
    return entry;
  }

  list(): ToolSpec[] {
    return [...this.tools.values()].map((t) => t.spec);
  }

  validateInput(name: string, input: unknown): InputValidationError[] {
    const entry = this.tools.get(name);
    if (!entry) throw badRequest(`unknown tool ${name}`, "unknown_tool");
    if (entry.inputValidator(input)) return [];
    return (entry.inputValidator.errors ?? []).map((e: ErrorObject) => ({
      code: `schema:${e.keyword}`,
      message: e.message ?? "invalid input",
      path: e.instancePath,
    }));
  }
}

export type { ContractError };
