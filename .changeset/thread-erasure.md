---
"simplia-agent-chat": minor
"@simplia/agent-chat-core": minor
---

Add `purgeThreadFromState` for data-lifecycle flows.

Removes every entity owned by a thread (thread, turns, items, surfaces,
interactions, usage) from the reduced `ChatState` without mutating the input
or touching other threads. Durable erasure stays application-owned; replay
guards (stream sequences, seen event ids) are kept so late duplicates cannot
resurrect a purged thread.
