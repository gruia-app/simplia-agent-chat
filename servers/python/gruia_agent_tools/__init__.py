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
from .registry import ToolRegistry
from .service import AgentToolsService
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
    "EntitlementDecision",
    "HttpAuditSink",
    "HttpEntitlementChecker",
    "JsonLinesSink",
    "OutboxDrainer",
    "PostgresStorage",
    "SqliteStorage",
    "StubEntitlement",
    "ToolRegistry",
    "assert_valid",
    "build_audit_event",
    "default_schema_dir",
    "hash_token",
    "load_schemas",
    "validate_document",
    "validate_entity",
    "validate_instance",
]
