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

## Post-reset tick (2026-09-21T21:45Z)

- Verified PR #9 (fda086a) and PR #10 (7732ba4) on origin/main; worktree clean.
- PR #11 `merge/provider-accounts-into-main` (other lane, authored pre-PR#10):
  reviewed non-dist diff — index.ts export union correct, sanitize/port contract
  keeps secrets write-only. Branch was BEHIND with stale checks; ran
  update-branch, fresh CI green (verify + git-consumer, Node 20/22), squash-merged
  as 3285c1e. Unblocks insaidrv3 (pin aa9a139) to adopt suggestions/voice.
- Lane mission items 1-4 (registry, voz, demo, doc) fully merged. No open PRs.
  Second wave is coordinator-gated; no new in-lane backlog items defined.

## Gap-burn tick (2026-09-21T22:20Z)

- PR #12 merged as ec94e8a (rebase over 3285c1e, CI green):
  - `core/src/timeline.ts`: `selectTimelinePage` + `TimelinePage`/`TimelineEntry`,
    `turn:`-prefixed id cursors (stable under tail appends), fail-closed
    `invalid_cursor`, limit clamp [1,500], items resolved per turn.
  - `react`: `AgentChatTheme` + `"high-contrast"` preset; AAA text / AA status /
    3:1 non-text contrast asserted in styles.test.mjs.
  - `examples/headless-lab`: framework-neutral consumer (replay -> page -> escaped
    HTML + suggestions), 5 tests via `pnpm -r test`.
  - `docs/MIGRATION.md` + release-policy guard test pinning CHAT_PROTOCOL_VERSION.
- Roadmap pre-1.0 actionable items all completed. Remaining: live provider
  conformance (needs credentials) -> DECISION. Lane converged.

## Limits/metering stream (2026-09-21T22:55Z)

- `core/src/limits.ts`: `ChatLimitNotice` (`quota_exceeded`/`plan_required`/
  `rate_limited`/`custom`) + `normalizeChatLimitNotice` fail-closed.
- `core/src/usage-meter.ts`: `diffChatUsage`, `collectUsageMeterEvents`,
  `watchChatUsage` — one `ChatUsageMeterEvent` per changed thread carrying
  `{threadId, organizationId, delta, usage}`; chat analogue of VoiceUsageEvent.
- `react/LimitNotice.tsx` + shell `limitNotice`/`onLimitAction`; blocking
  disables submit, draft editable. Copy key `limitNoticeLabel`.
- Tests: 6 core + 6 react. Docs: CHAT_FIRST + INTEGRATION. Changeset minor x3.

## Data lifecycle (2026-09-21T23:10Z)

- `core/src/erasure.ts`: `purgeThreadFromState` removes thread-owned entities
  (threads/turns/items/surfaces/interactions/usage) immutably; keeps stream
  sequences + seenEventIds so late duplicates cannot resurrect. 3 tests.
- Docs: ARCHITECTURE persistence section; changeset minor (root+core).
