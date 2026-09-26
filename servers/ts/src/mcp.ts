/** Proyección MCP §9.1: la implementación canónica vive en el paquete
 * de contrato; se re-exporta para que el servidor y el validador
 * compartan exactamente el mismo código (paridad 1:1 con Python).
 */

export {
  fromMcpName,
  MCP_NAME_MAX_LENGTH,
  MCP_NAME_PATTERN,
  MCP_SEPARATOR,
  RESERVED_NAMESPACES,
  toMcpName,
  toMcpTool,
} from "@simplia/agent-chat-contract";
export type { McpNameParts, McpTool, McpToolAnnotations } from "@simplia/agent-chat-contract";
