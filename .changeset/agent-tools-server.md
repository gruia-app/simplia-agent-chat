"@gruia/agent-tools-server": minor
---

Add `@gruia/agent-tools-server` (`servers/ts`): TypeScript server library for the chat-centric ToolSpec/Proposal contract (SPEC-CHAT-F1-R687 rev 3, §4/§6/§7/§8).

- `AgentToolsService` implements the ten §5 routes as methods: proposals, modify (`supersedes`), accept (single-use apply token), apply (token + entitlement/role/policy + cost re-check + CAS), discard (server-side grace), revert/compensate, `thread_id` listing.
- §4 tokens bound to `proposal_id + payload_hash + user_id + org_id + app_key`, sha256 server-side, constant-time compare, TTL ≤ 120 s; strong confirmations require an explicit ack.
- Default-deny `StubEntitlement`; `HttpEntitlementChecker` implements §8 fail-closed with ≤60 s cache.
- §6 audit: exact `AuditEvent` fields (never `input`/`preview`); `applied`/`reverted`/`compensated` written to the local outbox in the same transaction as the effect; at-least-once drain with `event_id` dedup.
- `Storage` interface with `MemoryStorage` reference implementation; tests share `fixtures/contract` with the Python package.
