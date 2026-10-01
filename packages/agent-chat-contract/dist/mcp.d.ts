/**
 * Proyección MCP 1:1 y determinista (SPEC-CHAT-F1-R687 rev 4/5 §9.1).
 *
 * `toMcpTool(ToolSpec)` produce un Tool válido según el schema de MCP
 * 2025-06-18 (vendorizado en fixtures/mcp/). `fromMcpName` hace la
 * inversa exacta sobre `<app_key>__<ns>__<verb>` — inequívoco porque
 * ningún segmento contiene `__` (validado por validateToolSpecRules).
 */
import type { ToolSpec } from "./generated/types.js";
export declare const MCP_NAME_PATTERN: RegExp;
export declare const MCP_NAME_MAX_LENGTH = 64;
export declare const MCP_SEPARATOR = "__";
/** Namespaces reservados: no puede haber ToolSpec de usuario con ns "proposal". */
export declare const RESERVED_NAMESPACES: readonly ["proposal"];
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
export declare function toMcpName(spec: Pick<ToolSpec, "app_key" | "name">): string;
/** Inversa exacta de toMcpName; lanza si el nombre no proyecta. */
export declare function fromMcpName(name: string): McpNameParts;
/**
 * Tool MCP 2025-06-18 proyectado desde ToolSpec (§9.1):
 * - `outputSchema` = `output_schema` en lectura, `ProposalRef` en escritura.
 * - `annotations`: readOnlyHint/idempotentHint solo cuando effect=read;
 *   destructiveHint y openWorldHint siempre false.
 */
export declare function toMcpTool(spec: ToolSpec): McpTool;
//# sourceMappingURL=mcp.d.ts.map