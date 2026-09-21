---
"simplia-agent-chat": minor
"@simplia/agent-chat-core": minor
---

Add a provider-neutral paged timeline contract for very long sessions.

- `selectTimelinePage(state, threadId, { limit, cursor })` returns a bounded, chronological `TimelinePage` of `TimelineEntry` (`turn` + resolved `items`) ordered exactly like `selectThreadTurns`, so pages are deterministic under replay.
- Without a cursor the selector returns the newest `limit` turns — the window a chat view mounts first. `nextCursor` pages towards older turns; cursors reference turn ids, not offsets, so they stay valid while new turns append at the tail.
- `limit` clamps to `[1, 500]` (default 50); malformed, unknown or foreign-thread cursors fail closed with `invalid_cursor` instead of skipping history.
- Rendering stays host-owned: the contract carries data only — virtualization library, row heights and scroll anchoring remain application decisions.
