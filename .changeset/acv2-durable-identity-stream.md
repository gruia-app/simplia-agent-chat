---
"@simplia/agent-chat-adapter-acv2": minor
---

Scope ACV2 durable identities by thread and emit stream metadata only from a durable cursor.

- Native run, message, tool, and fallback system IDs are scoped with `threadScopedTurnId` / `threadScopedEntityId` and do not double-prefix an already-scoped identifier.
- Native run and tool identity is preserved on `provider.nativeTurnId` / `provider.nativeThreadId` or item `metadata.nativeItemId`.
- A durable `cursor` emits stream metadata. Caller `streamId` is preserved; otherwise the adapter uses a deterministic per-thread, per-run stream ID.
- Sequence on the adapter context is not enough to emit stream metadata when no cursor exists.
