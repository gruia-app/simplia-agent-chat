---
"simplia-agent-chat": minor
"@simplia/agent-chat-core": minor
"@simplia/agent-chat-react": minor
---

Harden the voice module: typed error reasons and provider metering.

- `VoiceUsageEvent` and `VoiceSessionConfig` gain `provider` (defaults to `deepgram`) so per-tenant quota adapters get `{ tenant_id, duration_ms, provider }` without guessing the billed service.
- `useVoiceCapture` exposes `errorReason` (`unsupported`, `capture_failed`, `token_failed`, `transport_failed`, `transport_closed`, `invalid_frame`) for degraded-UI copy; mic-denial still never opens the transport and the failed session meters once with zero `audioBytes`.
- `VoiceButton` surfaces the error state through `voiceErrorLabel` and stays retryable; releasing during connect keeps the stopped state instead of overwriting it with an error.
- `docs/CHAT_FIRST.md` gains copy-paste backend references (FastAPI ephemeral-token endpoint and FastAPI WebSocket proxy) plus an error-degradation matrix.
