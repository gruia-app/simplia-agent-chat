"@simplia/agent-chat-contract": minor
---

Add `@simplia/agent-chat-contract`: JSON Schema (draft 2020-12) source of truth for the chat-centric contract (SPEC-CHAT-F1-R687 rev 2).

- Schemas for `ToolSpec`, `Proposal`, `ChangeRecord`, `AuditEvent` (`schema_version: 1`) and `ViewEvent` under `schema/`; TypeScript types are generated from the schemas (`src/generated/`) with a drift test that fails when they go stale.
- `validateContractDocument` / `assertContractDocument` (ajv draft 2020-12) plus the §2 cross rules in `validateToolSpecRules`: `read` ⇒ `confirm=none`, `reversible` ⇒ `card`|`strong`, `irreversible` ⇒ `strong` and `undo.mode` `none`|`compensate`, and `cost.kind` other than `none` ⇒ `estimator=true`.
- Valid and invalid fixtures under `fixtures/contract/`; a test guarantees the package exposes no free-text action parsing (SPEC §4).
- `ChangeRecord` and `ViewEvent` field sets are derived from §3/§4 and M-CHAT-CENTRIC §1.1/§1.5 pending PLAT confirmation.
