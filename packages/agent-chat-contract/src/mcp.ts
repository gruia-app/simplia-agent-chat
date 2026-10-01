/**
 * Proyección MCP 1:1 y determinista (SPEC-CHAT-F1-R687 rev 4/5 §9.1).
 *
 * `toMcpTool(ToolSpec)` produce un Tool válido según el schema de MCP
 * 2025-06-18 (vendorizado en fixtures/mcp/). `fromMcpName` hace la
 * inversa exacta sobre `<app_key>__<ns>__<verb>` — inequívoco porque
 * ningún segmento contiene `__` (validado por validateToolSpecRules).
 */

import { SCHEMAS } from "./generated/schemas.js";
import type { ToolSpec } from "./generated/types.js";

export const MCP_NAME_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;
export const MCP_NAME_MAX_LENGTH = 64;
export const MCP_SEPARATOR = "__";

/** Namespaces reservados: no puede haber ToolSpec de usuario con ns "proposal". */
export const RESERVED_NAMESPACES = ["proposal"] as const;

export interface McpToolAnnotations {
  title: string;
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
}

export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  annotations: McpToolAnnotations;
}

export interface McpNameParts {
  app_key: string;
  ns: string;
  verb: string;
}

/** `<app_key>__<ns>__<verb>` — determinista e inequívoco (§9.1). */
export function toMcpName(spec: Pick<ToolSpec, "app_key" | "name">): string {
  const [ns, verb] = spec.name.split(".");
  return `${spec.app_key}${MCP_SEPARATOR}${ns}${MCP_SEPARATOR}${verb}`;
}

/** Inversa exacta de toMcpName; lanza si el nombre no proyecta. */
export function fromMcpName(name: string): McpNameParts {
  if (!MCP_NAME_PATTERN.test(name)) {
    throw new Error(`invalid MCP tool name ${name}`);
  }
  const parts = name.split(MCP_SEPARATOR);
  if (parts.length !== 3 || parts.some((part) => part.length === 0)) {
    throw new Error(`MCP tool name ${name} does not have exactly 3 segments`);
  }
  const [app_key, ns, verb] = parts as [string, string, string];
  return { app_key, ns, verb };
}

/**
 * Tool MCP 2025-06-18 proyectado desde ToolSpec (§9.1):
 * - `outputSchema` = `output_schema` en lectura, `ProposalRef` en escritura.
 * - `annotations`: readOnlyHint/idempotentHint solo cuando effect=read;
 *   destructiveHint y openWorldHint siempre false.
 */
export function toMcpTool(spec: ToolSpec): McpTool {
  const outputSchema =
    spec.effect === "read"
      ? (spec.output_schema as Record<string, unknown>)
      : (SCHEMAS["proposal-ref"] as unknown as Record<string, unknown>);
  return {
    name: toMcpName(spec),
    description: spec.description,
    inputSchema: spec.input_schema as Record<string, unknown>,
    outputSchema,
    annotations: {
      title: spec.name,
      readOnlyHint: spec.effect === "read",
      destructiveHint: false,
      idempotentHint: spec.effect === "read",
      openWorldHint: false,
    },
  };
}
