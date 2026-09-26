"""Proyección MCP 1:1 y determinista (SPEC-CHAT-F1-R687 rev 4/5 §9.1).

Paridad con `packages/agent-chat-contract/src/mcp.ts`:
`to_mcp_tool(ToolSpec)` produce un Tool válido según el schema de MCP
2025-06-18 (vendorizado en fixtures/mcp); `from_mcp_name` hace la inversa
exacta sobre `<app_key>__<ns>__<verb>`.
"""

from __future__ import annotations

import re
from typing import Any

from . import contract

MCP_NAME_PATTERN = re.compile(r"^[a-zA-Z0-9_-]{1,64}$")
MCP_NAME_MAX_LENGTH = 64
MCP_SEPARATOR = "__"
RESERVED_NAMESPACES = ("proposal",)


def to_mcp_name(spec: dict[str, Any]) -> str:
    """`<app_key>__<ns>__<verb>` — determinista e inequívoco (§9.1)."""
    ns, _, verb = spec["name"].partition(".")
    return f"{spec['app_key']}{MCP_SEPARATOR}{ns}{MCP_SEPARATOR}{verb}"


def from_mcp_name(name: str) -> dict[str, str]:
    """Inversa exacta de to_mcp_name; lanza si el nombre no proyecta."""
    if not MCP_NAME_PATTERN.match(name):
        raise ValueError(f"invalid MCP tool name {name}")
    parts = name.split(MCP_SEPARATOR)
    if len(parts) != 3 or any(not part for part in parts):
        raise ValueError(f"MCP tool name {name} does not have exactly 3 segments")
    app_key, ns, verb = parts
    return {"app_key": app_key, "ns": ns, "verb": verb}


def to_mcp_tool(
    spec: dict[str, Any], *, proposal_ref_schema: dict[str, Any] | None = None
) -> dict[str, Any]:
    """Tool MCP 2025-06-18 proyectado desde ToolSpec (§9.1):
    - `outputSchema` = `output_schema` en lectura, `ProposalRef` en escritura.
    - `annotations`: readOnlyHint/idempotentHint solo cuando effect=read;
      destructiveHint y openWorldHint siempre false.
    """
    if spec["effect"] == "read":
        output_schema = spec["output_schema"]
    else:
        output_schema = proposal_ref_schema or contract.load_schemas()["proposal-ref"]
    return {
        "name": to_mcp_name(spec),
        "description": spec["description"],
        "inputSchema": spec["input_schema"],
        "outputSchema": output_schema,
        "annotations": {
            "title": spec["name"],
            "readOnlyHint": spec["effect"] == "read",
            "destructiveHint": False,
            "idempotentHint": spec["effect"] == "read",
            "openWorldHint": False,
        },
    }
