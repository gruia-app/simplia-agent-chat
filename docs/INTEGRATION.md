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

Adapter-produced turn, item, surface and interaction IDs are scoped by thread. Preserve native provider IDs from `provider.nativeTurnId` / `provider.nativeThreadId` or item metadata instead of parsing the scoped identifier.

## Connect the React shell

The shell is controlled. The application owns state, send/interrupt APIs and interaction resolution.

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
  artifactStageLabel="Review workspace"
/>
```

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
