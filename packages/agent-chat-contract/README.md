# @simplia/agent-chat-contract

Fuente única de verdad del contrato chat-céntrico (**SPEC-CHAT-F1-R687 rev 5**, CEO-PSAAS-R696 + PLAT-R696-01): JSON Schema draft 2020-12 de `ToolSpec`, `Proposal`, `ProposalRef`, `ChangeRecord`, `AuditEvent` y `ViewEvent`, con los tipos TypeScript generados desde el esquema, el validador de las reglas cruzadas de §2, la proyección MCP 1:1 de §9 y fixtures válidas/inválidas.

## Contenido

| Ruta | Contenido |
|---|---|
| `schema/*.schema.json` | Los 6 esquemas (draft 2020-12). **Única fuente de verdad.** |
| `src/generated/` | `schemas.ts` (esquemas como objetos) y `types.ts` (interfaces TS). Generados; no editar. |
| `src/validate.ts` | `validateEntity`, `validateToolSpec` (esquema + reglas cruzadas §2), `assertContractDocument`, `ContractValidationError`. |
| `src/mcp.ts` | `toMcpTool`, `toMcpName`, `fromMcpName`: proyección MCP 2025-06-18 de §9 (`<app_key>__<ns>__<verb>`, ≤64). |
| `fixtures/contract/` | `valid/*.json` (`{entity, document}`) e `invalid/*.json` (`{entity, document, expected_error}`). |
| `fixtures/mcp/2025-06-18.schema.json` | Schema JSON de MCP 2025-06-18 vendorizado; el test de proyección valida cada `toMcpTool` contra su `definitions.Tool`. |

## Reglas cruzadas de §2 (en código, no en el esquema)

- `read` ⇒ `confirm=none` (`read_requires_confirm_none`)
- `reversible` ⇒ `confirm` `card` o `strong` (`reversible_requires_card_or_strong`)
- `irreversible` ⇒ `confirm=strong` (`irreversible_requires_confirm_strong`)
- `irreversible` ⇒ `undo.mode` `none` o `compensate` (`irreversible_forbids_undo_revert`)
- `cost.kind` distinto de `none` ⇒ `cost.estimator=true` (`cost_kind_requires_estimator`)

## Regla cruzada de ChangeRecord (SPEC rev 3)

- `cost_actual` numérico ⇒ `cost_unit` no null (`cost_actual_requires_cost_unit`)

## Reglas de rev 4/5 (§2 output_schema, §9.1 nombres)

- `effect=read` ⇒ `output_schema` presente (`read_requires_output_schema`)
- `effect` escritura ⇒ `output_schema` = esquema `ProposalRef` (`write_requires_proposal_ref_output`)
- `__` prohibido en `app_key`/ns/verb (`forbidden_double_underscore`)
- ns `proposal` reservado a herramientas de sistema (`reserved_namespace_proposal`)
- proyección `<app_key>__<ns>__<verb>` ≤64 (`mcp_projection_too_long`)

## Auditoría ampliada (rev 4 §6)

`AuditEvent` exige `via` (`ui|mcp|cli`), `client_id`, `client_verified` y `confirm_channel` (`ui|review_url|elicitation|cli_tty|null`).

## Uso

```ts
import { validateContractDocument, assertContractDocument, SCHEMAS } from "simplia-agent-chat/contract";
import type { ToolSpec, Proposal } from "simplia-agent-chat/contract";

const errors = validateContractDocument("tool-spec", doc); // [] = válido
assertContractDocument("proposal", doc);                   // lanza ContractValidationError
```

## Regenerar tras editar un esquema

```bash
pnpm --filter @simplia/agent-chat-contract run generate   # reescribe src/generated/
pnpm --filter @simplia/agent-chat-contract test           # incluye test de deriva
```
