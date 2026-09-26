# @simplia/agent-chat-contract

Fuente única de verdad del contrato chat-céntrico (**SPEC-CHAT-F1-R687 rev 2**, congelado): JSON Schema draft 2020-12 de `ToolSpec`, `Proposal`, `ChangeRecord`, `AuditEvent` y `ViewEvent`, con los tipos TypeScript generados desde el esquema, el validador de las reglas cruzadas de §2 y fixtures válidas/inválidas.

## Contenido

| Ruta | Contenido |
|---|---|
| `schema/*.schema.json` | Los 5 esquemas (draft 2020-12). **Única fuente de verdad.** |
| `src/generated/` | `schemas.ts` (esquemas como objetos) y `types.ts` (interfaces TS). Generados; no editar. |
| `src/validate.ts` | `validateEntity`, `validateToolSpec` (esquema + reglas cruzadas §2), `assertContractDocument`, `ContractValidationError`. |
| `fixtures/contract/` | `valid/*.json` (`{entity, document}`) e `invalid/*.json` (`{entity, document, expected_error}`). |

## Reglas cruzadas de §2 (en código, no en el esquema)

- `read` ⇒ `confirm=none` (`read_requires_confirm_none`)
- `reversible` ⇒ `confirm` `card` o `strong` (`reversible_requires_card_or_strong`)
- `irreversible` ⇒ `confirm=strong` (`irreversible_requires_confirm_strong`)
- `irreversible` ⇒ `undo.mode` `none` o `compensate` (`irreversible_forbids_undo_revert`)
- `cost.kind` distinto de `none` ⇒ `cost.estimator=true` (`cost_kind_requires_estimator`)

## Derivados pendientes de confirmación PLAT

La SPEC rev 2 nombra `ChangeRecord` y `ViewEvent` pero no lista sus campos. Los esquemas llevan el conjunto mínimo derivado de §3/§4 (ChangeRecord) y M-CHAT-CENTRIC §1.1/§1.5 (ViewEvent), marcado con `DERIVADO` en la `description` del esquema.

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
