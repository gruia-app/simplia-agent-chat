"@simplia/agent-chat-contract": minor
---

Add `@simplia/agent-chat-contract`: JSON Schema (draft 2020-12) source of truth for the chat-centric contract (SPEC-CHAT-F1-R687 rev 2).

- Schemas for `ToolSpec`, `Proposal`, `ChangeRecord`, `AuditEvent` (`schema_version: 1`) and `ViewEvent` under `schema/`; TypeScript types are generated from the schemas (`src/generated/`) with a drift test that fails when they go stale.
- `validateContractDocument` / `assertContractDocument` (ajv draft 2020-12) plus the §2 cross rules in `validateToolSpecRules`: `read` ⇒ `confirm=none`, `reversible` ⇒ `card`|`strong`, `irreversible` ⇒ `strong` and `undo.mode` `none`|`compensate`, and `cost.kind` other than `none` ⇒ `estimator=true`.
- Valid and invalid fixtures under `fixtures/contract/`; a test guarantees the package exposes no free-text action parsing (SPEC §4).
- SPEC rev 3: `ChangeRecord.cost_unit` (`credits|money_cents|null`, required) with the `cost_actual_requires_cost_unit` cross rule; `ChangeRecord`/`ViewEvent` field sets approved as contract v1.
- SPEC rev 4/5 (CEO-PSAAS-R696): `ToolSpec.output_schema` (`ProposalRef` for writes, real schema for reads), the `ProposalRef` schema (§9), name restrictions (`__` banned, `proposal` namespace reserved, ≤64-char MCP projection), `toMcpTool`/`fromMcpName` against the vendored MCP 2025-06-18 schema, and `AuditEvent` `via`/`client_id`/`client_verified`/`confirm_channel`.
