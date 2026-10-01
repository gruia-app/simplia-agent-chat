# gruia-agent-tools (Python)

Librería de servidor del contrato de herramientas del agente
(`SPEC-CHAT-F1-R687` rev 4/5). Implementa §4 (seguridad y apply), §6
(auditoría y outbox), §7 (tests de token), §8 (entitlement `chat_tools`)
y §9 (modo delegado del gateway + proyección MCP).

El contrato normativo vive en `packages/agent-chat-contract` (JSON Schema
draft 2020-12 + fixtures). Este paquete valida contra **los mismos**
esquemas y fixtures — no hay segunda fuente de verdad.

## Qué incluye

- `contract` — carga de esquemas + validación (estructural y reglas
  cruzadas de §2) con los mismos códigos de error que el paquete TS.
- `registry.ToolRegistry` — registro de herramientas por `ToolSpec`
  validada + implementación por la app (`estimate`/`preview`/`apply`/
  `revert`/`compensate`). Cero parseo de texto libre (§4).
- `service.AgentToolsService` — los 10 endpoints de §5 como métodos:
  proposals, modify (supersedes), accept (emite apply token), apply,
  discard (incluye cancelación de gracia), revert-token, revert,
  compensate, listado por `thread_id`.
- `tokens` — apply/revert tokens de un solo uso, ligados a
  `(proposal_id, payload_hash, user_id, org_id, app_key)`, sha256 en
  servidor, comparación en tiempo constante, TTL ≤ 120 s.
- `entitlement` — capa 1: `StubEntitlement` **deniega por defecto**;
  `HttpEntitlementChecker` implementa §8 (`GET /v1/entitlements/{org}/{app}`,
  token de servicio, fail-closed, caché ≤ 60 s).
- `audit` — `AuditEvent` con los campos exactos de §6 (nunca `input` ni
  `preview`), outbox local at-least-once con dedup por `event_id`,
  `OutboxDrainer` con sink de log JSON o `HttpAuditSink` (forma de F2).
- `storage` — interfaz `Storage` + implementación SQL de referencia:
  `SqliteStorage` (tests) y `PostgresStorage` (misma SQL, `%s`), incluida
  la tabla `gateway_jtis` para el jti de un solo uso de §9.4.
- `mcp` — `to_mcp_tool`/`to_mcp_name`/`from_mcp_name`: proyección MCP
  2025-06-18 de §9.1 con paridad 1:1 al paquete TS.
- `gateway.DelegatedGateway` — modo delegado §9.3/§9.4/§9.5: verifica la
  aserción firmada por el kernel contra el JWKS del kernel
  (`jwks_resolver_from_document` resuelve el `kid`; JWT RS256,
  `aud=app_key`, `exp-iat<=60s`, `jti` de un solo uso → 401 en replay),
  exige token de servicio + aserción (sin aserción → 401), scopes
  `app:`/`tool:`/`tool:*` + entitlement `mcp_access`, herramientas de
  sistema `proposal__apply|revert|get` con elicitation solo si
  `reversible` + `card` + org activada + cliente verificado (si no,
  `review_url` sin token) y anti-IDOR → 404. Con `via="cli"` aplica la
  regla §9.5 (`cli_apply_allowed`): solo reversible+card con
  confirmación TTY (`cli_tty_confirmed`); el resto → `review_url` y no
  existe ningún flag `--yes`.

## Garantías (§4/§6/§7)

- Las tres capas (`entitlement`, `role`, `policy`) se evalúan en el
  servidor; cada denegación emite `AuditEvent` `denied` con `denied_layer`.
- El contexto del actor (`user_confirmed`/`model_context`) lo fija el
  transporte autenticado — el servidor nunca confía en claims del cliente.
- Aplicar dos veces la misma proposal con el mismo token devuelve el mismo
  `change_id`; la concurrencia se resuelve por CAS (un ganador, un 403).
- El coste se re-evalúa en el apply: si el estimador al alza escalaría
  `card → strong`, se devuelve 409 `cost_changed`.
- `grace_s` se ejecuta en el servidor: el apply marca `applied`, programa
  el efecto y `discard` dentro de la gracia lo cancela sin efecto.
- `applied`/`reverted`/`compensated` van al outbox en la **misma
  transacción** que el efecto. Kernel caído → fail-closed (403).

## Uso

```python
from gruia_agent_tools import (
    AgentToolsService, SqliteStorage, ToolRegistry, StubEntitlement,
    JsonLinesSink,
)

registry = ToolRegistry()
registry.register(toolspec, implementation)   # ToolSpec validada (§2)
service = AgentToolsService(
    storage=SqliteStorage("agent.db"),
    registry=registry,
    entitlement=StubEntitlement(allow=False),  # deniega por defecto
    outbox_sink=JsonLinesSink(),
)
```

El transporte HTTP (FastAPI/Flask, fuera de este paquete) mapea cada
método a su ruta de §5 y serializa `ContractError` como `{code, message}`
con el status correspondiente (400/403/404/409/410/422).

## Desarrollo

```bash
python3 -m venv .venv && .venv/bin/pip install -e ".[dev]"
.venv/bin/python -m pytest
```

Los tests de paridad leen `packages/agent-chat-contract/fixtures/contract`;
con el paquete instalado fuera del checkout, exporta
`AGENT_CHAT_CONTRACT_SCHEMA_DIR` apuntando al directorio `schema/`.
