# WORKLOG — simplia-agent-chat fleet worker

## 2026-09-21 — chat-first home + voice (mission)

Branch `t3code/fleet-agent-chat-260921-1147`.

- `packages/agent-chat-core/src/suggestions.ts`: typed suggestion contract —
  `ChatSuggestion`, `ChatSuggestionRegistry<C>`, validated
  `createChatSuggestionRegistry` (fail-closed on invalid/duplicate),
  `resolveChatSuggestions` (static first, one derived last, dedupe, cap 5),
  `createAccountSnapshotDerive` (empty account → quota ≥0.8 → fallback).
- `packages/agent-chat-core/src/voice.ts`: `VoiceTransport` port (open/send/
  close), `VoiceUsageEvent` emitted once per session (duration, audioBytes,
  finalTranscripts, tenant/org, endReason), `createVoiceSession` status
  machine, `createDeepgramSocketTransport` (ephemeral token, token
  subprotocol auth, Results→frames, CloseStream, optional KeepAlive),
  `createWebSocketProxyTransport` (app-owned WS, normalized
  `{type:"transcript"}` frames, control message), `createScriptedVoiceTransport`
  for labs/tests.
- `packages/agent-chat-react`: `SuggestionChips` (roving tabindex,
  Arrow/Home/End), `ChatComposer.draft` (revision-gated injection),
  `AgentChatShell` props `suggestions`, `onSuggestionSelect`,
  `suggestionsAriaLabel`, `composerDraft` (host draft wins over suggestion
  draft), `useVoiceCapture` (mic-first ordering so permission denial never
  opens/bills the transport, stop flushes tail audio before close),
  `VoiceButton` (hold pointer or Space/Enter), new copy keys + styles.
- `examples/react-lab`: `home` fixture (empty thread) + account-scenario
  switcher (new/quota 82%/normal) + scripted voice transport with metering
  echoed to the lab output; transcripts staged via `composerDraft`.
- `docs/CHAT_FIRST.md`: per-app recipe (home mount, registry, both backend
  voice patterns, metering hook). Linked from `docs/INTEGRATION.md`.
- Changeset: `.changeset/chat-first-home-voice.md` (minor ×3 packages).

Verification: core build+20 tests, react build+82 tests (7 new), vite build
of react-lab. `pnpm check` pending final run.

## Voice hardening (follow-up)

- `packages/agent-chat-core/src/voice.ts`: `provider` on `VoiceSessionConfig`
  + `VoiceUsageEvent` (default `deepgram`) — quota adapters get
  `{tenant_id, duration_ms, provider}` without guessing.
- `packages/agent-chat-react/src/use-voice-capture.ts`: exposes
  `errorReason` (typed union incl. `unsupported`/`capture_failed`/`token_failed`/
  `transport_failed`); `provider` option plumbed into session config.
- `VoiceButton`: error state uses `voiceErrorLabel`, stays retryable.
- `docs/CHAT_FIRST.md`: error-degradation matrix (reason → billed?),
  FastAPI ephemeral-token endpoint + WS proxy reference implementations,
  metering contract with snake_case quota mapping.
- Tests: provider in metering, transport failure reason + retry, mic denial
  emits zero-byte `error` event without opening the transport.
- Changeset: `.changeset/voice-hardening-metering.md` (minor ×3).
