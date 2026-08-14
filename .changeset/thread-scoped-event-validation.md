---
"@simplia/agent-chat-core": minor
---

Validate chat event envelopes at runtime and make the reducer safe for unknown input.

- `validateChatEvent()` returns a discriminated success/error result and never throws or applies state.
- `reduceChatEvent()` rejects invalid envelopes, unsupported protocol majors, and unknown types without consuming event IDs or mutating entities.
- A `thread.snapshot` that carries stream metadata may close a sequence gap by installing the snapshot and adopting that stream high-water mark. Recovery snapshots must include stream metadata.
- `item.delta` immediately creates and links the streaming item on its turn; later `turn.upsert` unions existing item IDs and cannot reopen a terminal turn.
- Envelope and payload thread/turn IDs must agree. Snapshots only replace entities that belong to their thread.
- Codex, LangChain, and OpenAI-compatible adapters scope provider-native turn, item, surface, and interaction IDs by thread and keep native IDs in metadata.
