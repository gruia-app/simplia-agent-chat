---
"simplia-agent-chat": minor
"@simplia/agent-chat-core": minor
"@simplia/agent-chat-react": minor
---

Add derived operational run state, honest interrupt-request UX, fail-closed application message rendering, and a resilient reusable composer.

- `selectThreadRunState` / `selectActiveTurn` / `isTerminalTurnStatus` project waiting, queued, streaming, busy and terminal outcomes from existing entities without mutating protocol state.
- `onInterrupt` only reports that a stop was requested; Stop stays separate from Send and appears only when an active turn and handler both exist.
- `renderMessage` remains application-owned and fails closed to escaped item text, never exception text or raw metadata.
- The composer fences double submit, restores a rejected snapshot only when the draft is unchanged, and accepts optional actions that do not send.
