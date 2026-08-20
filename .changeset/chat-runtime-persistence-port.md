---
"simplia-agent-chat": minor
"@simplia/agent-chat-core": minor
---

Add an opt-in ChatRuntime and caller-owned snapshot/journal persistence port.

- `createChatRuntime()` applies events through `reduceChatEvent` and notifies subscribers only when the state reference changes.
- `ChatPersistencePort` is implemented by the application. `commitChatEvent()` validates, appends, then applies; `hydrateChatRuntime()` rebuilds state from an optional `thread.snapshot` plus bounded opaque journal pages.
- Recovery snapshots must carry envelope stream metadata. The in-memory helper is volatile and for tests or labs only. Application storage stays consumer-owned.
