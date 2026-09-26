# @gruia/agent-tools-server (TypeScript)

Librería de servidor del contrato de herramientas del agente
(`SPEC-CHAT-F1-R687` rev 4/5, `CEO-PSAAS-R696` + `PLAT-R696-01`). Misma
semántica que `servers/python` (`gruia_agent_tools`): implementa §4
(seguridad y apply), §6 (auditoría y outbox), §7 (tests de token), §8
(entitlement `chat_tools`) y §9 (proyección MCP + modo delegado).

El contrato normativo vive en `packages/agent-chat-contract` — este
paquete reutiliza su validador y tipos generados, y sus tests recorren
las mismas fixtures que la suite Python.

## Qué incluye

- `ToolRegistry` — registro de herramientas por `ToolSpec` validada +
  implementación por la app (`estimate`/`preview`/`apply`/`revert`/
  `compensate`). Cero parseo de texto libre (§4).
- `AgentToolsService` — los 10 endpoints de §5 como métodos: proposals,
  modify (supersedes), accept (emite apply token), apply, discard
  (incluye cancelación de gracia), revert-token, revert, compensate,
  listado por `thread_id`.
- `tokens` — apply/revert tokens de un solo uso, ligados a
  `(proposal_id, payload_hash, user_id, org_id, app_key)`, sha256 en
  servidor, `timingSafeEqual`, TTL ≤ 120 s.
- `entitlement` — `StubEntitlement` **deniega por defecto**;
  `HttpEntitlementChecker` (§8) es fail-closed con caché ≤ 60 s.
- `audit` — `AuditEvent` con los campos exactos de §6 rev 4 (`via`,
  `client_id`, `client_verified`, `confirm_channel`; nunca `input` ni
  `preview`), outbox at-least-once con dedup por `event_id`,
  `JsonLinesSink` por defecto y `HttpAuditSink` con la forma de F2.
- `storage` — interfaz `Storage` + `MemoryStorage` de referencia; las
  operaciones CAS se traducen 1:1 a SQL en producción. Incluye la tabla
  de `jti` del gateway (un solo uso, se conserva durante su `exp`).
- `mcp` — re-exporta `toMcpTool`/`toMcpName`/`fromMcpName` del paquete
  de contrato (paridad 1:1 con Python).
- `gateway` — `DelegatedGateway` (§9.3–§9.5): token de servicio +
  aserción firmada por el kernel verificada contra el JWKS del kernel
  (`jwksResolverFromDocument` resuelve el `kid`; `aud=app_key`,
  `exp-iat≤60 s`, `jti` de un solo uso → 401 en replay), scopes
  `app:`/`tool:`, entitlement `mcp_access`, herramientas de sistema
  `<app_key>__proposal__apply|revert|get` con elicitation o `review_url`
  (sin token), y aislamiento anti-IDOR → 404. Las escrituras por MCP
  solo crean proposals y devuelven `ProposalRef`. Con `via="cli"`
  aplica la regla §9.5 (`cliApplyAllowed`): solo reversible+card con
  confirmación TTY (`cliTtyConfirmed`); el resto → `review_url` y no
  existe ningún flag `--yes`.

## Garantías (§4/§6/§7)

- Tres capas server-side (`entitlement`, `role`, `policy`); cada
  denegación emite `AuditEvent` `denied` con `denied_layer`.
- Actor y contexto (`user_confirmed`/`model_context`) vienen del
  transporte autenticado — nunca de claims del cliente.
- Apply repetido con el mismo token devuelve el mismo `change_id`; la
  concurrencia se resuelve por CAS (un ganador, un 403).
- Coste re-evaluado en el apply → 409 `cost_changed` si escala
  `card → strong`.
- `grace_s` en el servidor: `applied` + efecto programado; `discard`
  dentro de la gracia lo cancela sin efecto.
- `applied`/`reverted`/`compensated` van al outbox en la misma
  transacción que el efecto. Kernel caído → fail-closed.

## Uso

```ts
import {
  AgentToolsService, JsonLinesSink, MemoryStorage,
  StubEntitlement, ToolRegistry,
} from "@gruia/agent-tools-server";

const registry = new ToolRegistry();
registry.register(toolspec, implementation); // ToolSpec validada (§2)
const service = new AgentToolsService({
  storage: new MemoryStorage(),
  registry,
  entitlement: new StubEntitlement(false), // deniega por defecto
  outboxSink: new JsonLinesSink(),
});
```

El transporte HTTP mapea cada método a su ruta de §5 y serializa
`ContractError` como `{code, message}` con su status
(400/403/404/409/410/422).

## Desarrollo

```bash
pnpm --dir servers/ts run build
pnpm --dir servers/ts test
```

Los tests de paridad leen `packages/agent-chat-contract/fixtures/contract`.
