# Chat-first home and voice

Recipe for mounting `AgentChatShell` as the post-login home of an app, with
initial suggestion chips and push-to-talk voice input. Reference
implementation: `examples/react-lab` (`home` fixture).

## Mount the shell as home

The shell is controlled; the app owns state and submit APIs. For a home
screen, point it at an empty or the most recent thread and keep the header
app-branded via `headerLabel`/`title`. Suggestions render above the composer
when the `suggestions` prop is non-empty — the app decides when to pass them
(typically only while the thread has no items).

## Suggestion registry

Contracts live in `simplia-agent-chat/core`:

```ts
import {
  createAccountSnapshotDerive,
  createChatSuggestionRegistry,
  resolveChatSuggestions,
  type ChatAccountSnapshot,
} from "simplia-agent-chat/core";

const registryResult = createChatSuggestionRegistry<ChatAccountSnapshot>({
  staticSuggestions: [
    { id: "daily-brief", label: "Briefing del día", prompt: "Prepara mi briefing del día con lo pendiente." },
    { id: "pending-work", label: "Trabajo pendiente", prompt: "Resume el trabajo pendiente y su prioridad." },
    { id: "weekly-report", label: "Informe semanal", prompt: "Redacta el informe semanal con evidencias." },
  ],
  derive: createAccountSnapshotDerive({
    emptyAccountSuggestion: {
      id: "first-project",
      label: "Crea tu primer proyecto",
      prompt: "Crea mi primer proyecto paso a paso.",
    },
    quotaWarningSuggestion: (snapshot) => ({
      id: "upgrade-plan",
      label: "Amplía tu plan",
      prompt: `Mi cuota está al ${Math.round((snapshot.quotaUsedRatio ?? 0) * 100)}%. ¿Qué plan me conviene?`,
    }),
    // quotaWarningThreshold defaults to 0.8
  }),
});
if (!registryResult.ok) throw new Error(registryResult.reason);
const registry = registryResult.registry;
```

Rules:

- `staticSuggestions` are the 3-4 curated prompts, always first, in declared
  order. `derive` returns at most one extra suggestion appended last —
  `createAccountSnapshotDerive` implements the canonical precedence: empty
  account wins over quota pressure, then an optional `fallback`.
- `resolveChatSuggestions(registry, { context, limit })` re-validates,
  dedupes by `id` and caps the row (default limit 5). A throwing or invalid
  `derive` is dropped; the static row still renders.
- `ChatAccountSnapshot` is the minimal shape (`isEmpty`, `quotaUsedRatio`).
  Richer app snapshots work through a custom `derive`.

Render and select:

```tsx
<AgentChatShell
  state={state}
  threadId={threadId}
  surfaceRegistry={surfaceRegistry}
  title="Inicio"
  headerLabel="Contenido"
  composerAriaLabel="Mensaje para el asistente"
  suggestions={isEmptyThread ? resolveChatSuggestions(registry, { context: account }) : undefined}
  onSuggestionSelect={(s) => telemetry.track("suggestion", { id: s.id })}
  onSubmit={(message) => api.startTurn({ threadId, message })}
  onResolveInteraction={...}
/>
```

Selecting a chip stages `suggestion.prompt` into the composer (editable
before submit) and then calls `onSuggestionSelect`. The chip row is a single
Tab stop with Arrow/Home/End navigation.

`composerDraft` (`{ value, revision }`) injects external text into the
composer — voice transcripts use it. When the host passes `composerDraft`,
suggestion clicks no longer write the draft themselves; the host owns it via
`onSuggestionSelect` (the lab mirrors the prompt into `composerDraft` there
to keep both paths working).

## Voice input

`useVoiceCapture` + `VoiceButton` provide push-to-talk dictation that lands
in the composer as editable text. The provider API key never reaches the
browser; billing stays per-app.

```tsx
import { useVoiceCapture, VoiceButton, type ChatComposerDraft } from "simplia-agent-chat/react";

const capture = useVoiceCapture({
  transport: voiceTransport,      // see backend patterns below
  tenantId: tenant.id,            // metering attribution
  organizationId: org.id,
  meter: (event) => quotas.recordVoiceUsage(event), // your quota system
  onTranscript: (frame) => {
    if (!frame.isFinal) return;
    setDraft((d) => ({ value: append(d?.value, frame.text), revision: (d?.revision ?? 0) + 1 }));
  },
});

<AgentChatShell
  ...
  composerDraft={draft}
  composerActions={<VoiceButton capture={capture} />}
/>
```

- Hold to record (pointer or Space/Enter), release to stop. `capture.status`
  is `idle | starting | recording | error`; `capture.interim` shows the live
  non-final transcript; `capture.transcript` accumulates finals.
- Mic permission denial (`capture_failed`) never opens the transport, so an
  aborted press is never billed.
- `useVoiceCapture` defaults to `getUserMedia` + `MediaRecorder`
  (`audio/webm;codecs=opus` first match, 250 ms timeslice). Tests inject
  `createSource`; `supported` reports capability.
- `model`/`language` default to `nova-3`/`multi`. Keep `multi` for the
  Spanish fleet unless an app needs a pinned locale.

### Backend patterns (per app)

Each app holds its own `DEEPGRAM_API_KEY` server-side. Nothing is shared
between tenants or apps. Two supported shapes:

**A. Ephemeral token (preferred).** The app exposes
`POST /api/voice/token` (authenticated, tenant-scoped) that calls Deepgram's
`/v1/auth/grant` and returns a short-lived token. The browser connects
directly:

```ts
import { createDeepgramSocketTransport } from "simplia-agent-chat/core";

const transport = createDeepgramSocketTransport({
  getToken: async () => (await fetch("/api/voice/token", { method: "POST" })).json().then((r) => r.token),
  params: { smart_format: "true", encoding: "opus" },
  keepAliveMs: 8000,
});
```

The transport maps `Results` frames to `{ text, isFinal }` and sends
`CloseStream` on close. The raw `DEEPGRAM_API_KEY` stays in the app env.

**B. Backend WebSocket proxy.** The app accepts a tenant-scoped WebSocket
(e.g. `/api/voice/stream`), forwards audio to Deepgram, and returns
normalized frames:

```ts
const transport = createWebSocketProxyTransport({
  url: (config) => `wss://app.example/api/voice/stream`,
  protocols: "voice.v1",
  controlMessage: { type: "start" },   // sent once; config is merged in
});
```

Downstream frames are JSON `{ "type": "transcript", "text": "...", "is_final": true|false }`.
Upstream frames are raw encoded audio plus the optional control message.

### Metering hook

Every session emits exactly one `VoiceUsageEvent` through `meter`:

```ts
{
  kind: "voice_session",
  sessionId, model, language,
  tenantId, organizationId,
  startedAt, endedAt, durationMs,
  audioBytes,          // encoded bytes accepted by the transport
  finalTranscripts,    // count of isFinal frames
  endReason,           // completed | stopped | error | aborted
}
```

Connect `meter` to the app's quota/billing pipeline. Emitted once even on
error/abort paths; the lab prints it into its status output.

## Accessibility and copy

Chips and the voice button are localized through `AgentChatCopy`:
`suggestionsLabel`, `voiceStartLabel`, `voiceStopLabel`,
`voiceConnectingLabel`, `voiceUnsupportedLabel`, `voiceErrorLabel`.
`suggestionsAriaLabel` overrides the chip group label on the shell.
