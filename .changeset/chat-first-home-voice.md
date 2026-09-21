---
"simplia-agent-chat": minor
"@simplia/agent-chat-core": minor
"@simplia/agent-chat-react": minor
---

Add chat-first home suggestions and push-to-talk voice input.

- Core exports a provider-neutral suggestion contract: `createChatSuggestionRegistry`, `resolveChatSuggestions` and `createAccountSnapshotDerive` (3-4 curated static entries plus one account-state-derived chip — empty account first, quota pressure at 0.8 next).
- Core exports the voice contract: `VoiceTransport` port, one-shot `VoiceUsageEvent` metering (tenant/org attribution for per-app billing), `createVoiceSession`, reference transports for the Deepgram ephemeral-token pattern (`createDeepgramSocketTransport`) and the backend WebSocket proxy (`createWebSocketProxyTransport`), plus `createScriptedVoiceTransport` for labs and tests.
- React renders `SuggestionChips` above the composer (roving tabindex, Arrow/Home/End) and `AgentChatShell` accepts `suggestions`/`onSuggestionSelect`/`suggestionsAriaLabel`. `ChatComposer` gains a revision-gated `draft` prop exposed on the shell as `composerDraft`.
- React adds `useVoiceCapture` + `VoiceButton`: hold-to-record over `getUserMedia`/`MediaRecorder` (injectable source), mic failures never open the transport, transcripts stay editable before submit.
- `examples/react-lab` mounts a `home` fixture with an account-scenario switcher, suggestion chips and a scripted voice button with visible metering. See `docs/CHAT_FIRST.md` for the per-app integration recipe.
