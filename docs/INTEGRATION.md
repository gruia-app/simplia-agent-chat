# Integration guide

## Choose the provider contract

Use an `AgentProviderPort` when the backend has durable sessions, tools, approvals or steering. Use a `ChatCompletionPort` for an OpenAI-compatible response stream. Do not emulate unsupported agent capabilities in the UI.

## Normalize before rendering

Provider SDK or transport events should pass through a `ChatTransportAdapter`. Persist or stream normalized `ChatEvent` envelopes, validate them, then reduce them with `reduceChatEvent`.

```ts
import { validateChatEvent } from "simplia-agent-chat/core/protocol";
import { reduceChatEvent, createInitialChatState } from "simplia-agent-chat/core/state";
import { codexAppServerAdapter } from "simplia-agent-chat/core/adapters/codex";

let state = createInitialChatState();
for (const event of codexAppServerAdapter.normalize(notification, context)) {
  const validated = validateChatEvent(event);
  if (!validated.ok) continue;
  state = reduceChatEvent(state, validated.event).state;
}
```

`reduceChatEvent` also validates unknown input. Failures return `invalid_event`, `unsupported_protocol` or `unknown_event_type` and leave entity state and seen event IDs unchanged.

When replay cannot close a stream gap, send a `thread.snapshot` that includes `stream.id` and `stream.sequence` set to the recovered high-water mark. A recovery snapshot MUST carry that stream metadata; without it the snapshot cannot adopt the stream cursor or clear the resync request.

Direct reducer use remains supported. Applications that want in-process subscribers or a caller-owned journal can opt into `ChatRuntime` and `ChatPersistencePort` without changing event types.

```ts
import { createChatRuntime } from "simplia-agent-chat/core/runtime";
import {
  commitChatEvent,
  createThreadSnapshotEvent,
  hydrateChatRuntime,
} from "simplia-agent-chat/core/persistence";

const hydrated = await hydrateChatRuntime(persistence, {
  threadId,
  streamId,
  limit: 256,
});
if (!hydrated.ok) throw new Error(hydrated.reason);
const runtime = hydrated.runtime;
const unsubscribe = runtime.subscribe(() => render(runtime.getState()));

const committed = await commitChatEvent(runtime, persistence, event, { signal });
if (!committed.ok) {
  // validation, abort, or append failed: runtime and subscribers were not touched
  return;
}
// append already succeeded. duplicate/gap/conflict stay persisted; do not roll back.

const snapshot = createThreadSnapshotEvent({
  state: runtime.getState(),
  threadId,
  id: snapshotEventId,
  source: "app",
  occurredAt,
  streamId,
});
if (snapshot.ok) await persistence.saveSnapshot?.(snapshot.event);
```

Ordering and failure boundaries:

- `commitChatEvent` validates, then appends, then applies. Concurrent commits on the same runtime run in call order. A rejected queue item does not poison later commits.
- A rejected append leaves runtime state untouched and means persistence was not confirmed. Snapshot or journal read exceptions return `load_failed` without exposing a partially hydrated runtime.
- Journal pages use an opaque `cursor`, not a sequence. Pass snapshot envelope `{ stream.id, stream.sequence }` as `after` when hydrating a tail. When `done` is false, empty pages, missing cursors, and repeated cursors fail closed.
- One durable stream per thread is the supported production shape. Unsequenced events may still reduce, but they are unsafe as durable records.
- `createMemoryChatPersistence` is volatile and for tests or local labs only. Application storage remains consumer-owned.

Adapter-produced turn, item, surface and interaction IDs are scoped by thread. Preserve native provider IDs from `provider.nativeTurnId` / `provider.nativeThreadId` or item metadata instead of parsing the scoped identifier.

## Connect the React shell

The shell is controlled. The application owns state, send/interrupt APIs and interaction resolution.

```tsx
<AgentChatShell
  state={state}
  threadId={threadId}
  title="Assistant"
  headerLabel="Mesa de operaciones"
  theme="light"
  surfaceRegistry={surfaceRegistry}
  composerAriaLabel="Mensaje para el asistente"
  emptyLabel="Todavía no hay mensajes. Envía una instrucción precisa para empezar."
  composerPlaceholder="Describe la siguiente acción…"
  copy={{
    composerSubmitLabel: "Enviar",
    composerHint: "Enter envía · Mayús+Enter nueva línea",
    decisionLabel: (decision) => {
      if (decision === "approve") return "Aprobar";
      if (decision === "deny") return "Rechazar";
      return decision;
    },
    confirmDecisionLabel: (decision) =>
      decision === "approve" ? "Confirmar aprobar" : `Confirmar ${decision}`,
  }}
  onSubmit={(message) => api.startTurn({ threadId, message })}
  onInterrupt={(turn) => api.interrupt({ threadId, turnId: turn.id })}
  onResolveInteraction={(interaction, resolution) =>
    api.resolveInteraction({ interactionId: interaction.id, resolution })
  }
  onSurfaceAction={(block, action, input) =>
    api.dispatchSurfaceAction({ block, action, input })
  }
  artifactStageLabel="Espacio de revisión"
/>
```

Copy changes display labels, hints and ARIA text only. Event IDs, `onResolve` decision values, status values and payloads stay protocol data: clicking **Aprobar** still submits `{ decision: "approve" }`. Formatters such as `runPhaseLabel` receive only documented primitive values.

`selectThreadRunState(state, threadId)` and `selectActiveTurn(state, threadId)` are read-only projections. They return existing turn and interaction references and never mutate `ChatState`. Waiting wins, then queued, then running with a streaming item (`streaming`), then running (`busy`), then the latest terminal outcome, then an empty thread in `error` (`failed`), otherwise `idle`.

The shell's existing `busy` prop is an optimistic transport overlay: while a new submission is in flight but no new turn event exists yet, an `idle` or previously `completed` projection is displayed as `busy`. It never invents a turn ID or enables Stop.

Pass `onInterrupt(turn)` when the application can request a stop. The shell only reports that a stop was requested. It does not mark the turn cancelled or interrupted. Double requests for the same active turn are ignored while the request is submitting or submitted. A rejected request unlocks retry and shows `interruptError` without exception text. Stop is omitted unless both an active turn and `onInterrupt` exist, and it stays separate from Send. `renderRunStatus` replaces the default run-status chrome.

The default composer accepts optional `actions` and `onDraftChange`. Action-slot clicks do not submit. `composerActions` is passed only to the default composer. A local submitting fence sends one snapshot even if the host has not set `busy` yet. If `onSubmit` throws or rejects, the snapshot is restored only when the operator has not typed a replacement draft. The textarea stays editable while busy so the next instruction can be drafted; `disabled` still blocks editing.

`renderMessage` stays an application-owned slot. The library does not add a Markdown or HTML parser. Renderer failures fall back to React-escaped `item.text`, or `messageRendererFallback` when that text is empty, without exception text or raw metadata/input/output. Tool and command work details never invoke `renderMessage`.

Granular props win over `copy`, which wins over the English defaults: `emptyLabel` / `composerPlaceholder` / `artifactStageLabel` / `ChatComposer` `placeholder` `submitLabel` `hint`. The shell has no library brand; pass `headerLabel` when the application wants a small owner label. `theme` is `"dark" | "light"`; omitted keeps the dark compatibility palette. See [Theming](THEMING.md).

`presentation.preferredSurface` is a layout hint. Missing or unknown values default to `inline` and stay in the transcript. `panel` surfaces are omitted from the timeline and rendered once through `SurfaceHost` in a default artifact stage. `fullscreen` surfaces are host-owned: the shell does not inline them or open a library modal.

Hosts may replace the default panel stage without forking the timeline. Fullscreen rendering is opt-in:

```tsx
<AgentChatShell
  state={state}
  threadId={threadId}
  title="Assistant"
  surfaceRegistry={surfaceRegistry}
  composerAriaLabel="Message the assistant"
  onSubmit={(message) => api.startTurn({ threadId, message })}
  onResolveInteraction={(interaction, resolution) =>
    api.resolveInteraction({ interactionId: interaction.id, resolution })
  }
  onSurfaceAction={(block, action, input) =>
    api.dispatchSurfaceAction({ block, action, input })
  }
  renderArtifactStage={({ surfaces, surfaceRegistry, onSurfaceAction }) => (
    <ReviewPane surfaces={surfaces} registry={surfaceRegistry} onAction={onSurfaceAction} />
  )}
  renderFullscreenSurfaces={({ surfaces, surfaceRegistry, onSurfaceAction }) => (
    <WorkspaceCanvas surfaces={surfaces} registry={surfaceRegistry} onAction={onSurfaceAction} />
  )}
/>
```

`artifactStageLabel` localizes the accessible heading of the default stage. Both slots receive the original selected blocks so action callbacks keep block and action identity. Unknown panel surfaces still fail closed. Consumers without panel or fullscreen surfaces keep the existing single-column shell. When a panel stage is present, the workspace is one column in a constrained shell container and two columns when that container has room.

Use `selectThreadSurfaces(state, threadId, preferredSurface?)` to read the same placement split from core. Omit the placement argument to receive every surface for the thread in deterministic state order.

## Server-side action gate

For every approval or surface action, verify:

1. authenticated identity and tenant membership;
2. thread and application ownership;
3. pending interaction or current surface revision;
4. policy and capability grant;
5. input schema;
6. idempotency key;
7. audit append before executing the effect.

## ACV2

Import `acv2PmAdapter` from `simplia-agent-chat/adapters/acv2` to normalize durable PM/run events. The subpath also exposes the nine current provider profiles. Runtime capability discovery should override stale static assumptions, but never grant permission by itself.

`acv2PmAdapter` scopes native run, message, tool, and fallback system IDs by `context.threadId` without double-scoping an already-prefixed identifier. Preserve native run and tool identity from `provider.nativeTurnId` / `provider.nativeThreadId` or item `metadata.nativeItemId` instead of parsing the scoped identifier.

When a durable `cursor` is present, the adapter emits stream metadata. `stream.id` is the caller `context.streamId` when supplied, otherwise a deterministic per-thread, per-run stream ID. A sequence on the adapter context is not enough: without a cursor the adapter does not emit stream metadata. After a gap, send a `thread.snapshot` on that same stream with the recovered high-water mark so replay can continue.

## LangChain

`langChainAdapter` supports messages, updates, custom and event modes. Preserve tool-call identity and partial chunks; do not trim meaningful streaming whitespace.

## OpenRouter and other OpenAI-compatible APIs

Use `openRouterAdapter` or `createOpenAiCompatibleAdapter`. These adapters expose chat-completion semantics only. Filesystem, terminal, approval, rollback and subagent features remain unsupported.

## Versioning

Include `protocolVersion` in persisted events and `schemaVersion` in every surface. Reject unknown protocol major versions. Surface plugins may support more than one schema version during migrations.
