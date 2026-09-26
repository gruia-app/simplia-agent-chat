"""gruia_agent_tools — librería de servidor del contrato de herramientas del
agente (SPEC-CHAT-F1-R687 rev 3, §4/§6/§7/§8).

La misma lógica de dominio sirve detrás de cualquier framework HTTP; el
transporte solo tiene que inyectar el actor autenticado y el contexto
(X-Actor-Context), nunca claims del cliente.
"""

from .audit import (
    AUDIT_FIELDS,
    HttpAuditSink,
    JsonLinesSink,
    OutboxDrainer,
    build_audit_event,
)
from .contract import (
    CONTRACT_ENTITIES,
    ContractErrorItem,
    ContractValidationError,
    assert_valid,
    default_schema_dir,
    load_schemas,
    validate_document,
    validate_entity,
    validate_instance,
)
from .entitlement import (
    ChatToolsEntitlement,
    CostThreshold,
    EntitlementDecision,
    HttpEntitlementChecker,
    StubEntitlement,
)
from .errors import ContractError
from .gateway import DelegatedAssertion, DelegatedGateway, issue_test_assertion
from .mcp import (
    MCP_NAME_MAX_LENGTH,
    MCP_NAME_PATTERN,
    MCP_SEPARATOR,
    RESERVED_NAMESPACES,
    from_mcp_name,
    to_mcp_name,
    to_mcp_tool,
)
from .registry import ToolRegistry
from .service import AgentToolsService, RouteInfo
from .storage.sql import PostgresStorage, SqliteStorage
from .tokens import hash_token

__all__ = [
    "AUDIT_FIELDS",
    "AgentToolsService",
    "CONTRACT_ENTITIES",
    "ChatToolsEntitlement",
    "ContractError",
    "ContractErrorItem",
    "ContractValidationError",
    "CostThreshold",
    "DelegatedAssertion",
    "DelegatedGateway",
    "EntitlementDecision",
    "HttpAuditSink",
    "HttpEntitlementChecker",
    "JsonLinesSink",
    "MCP_NAME_MAX_LENGTH",
    "MCP_NAME_PATTERN",
    "MCP_SEPARATOR",
    "OutboxDrainer",
    "PostgresStorage",
    "RESERVED_NAMESPACES",
    "RouteInfo",
    "SqliteStorage",
    "StubEntitlement",
    "ToolRegistry",
    "assert_valid",
    "build_audit_event",
    "to_mcp_name",
    "to_mcp_tool",
    "default_schema_dir",
    "from_mcp_name",
    "hash_token",
    "issue_test_assertion",
    "load_schemas",
    "validate_document",
    "validate_entity",
    "validate_instance",
]
