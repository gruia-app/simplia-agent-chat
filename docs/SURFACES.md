# Surface plugins

Surfaces let applications render domain artifacts without adding domain concepts to the chat kernel.

## Core plugin

```ts
import { SurfaceRegistry } from "simplia-agent-chat/core/surfaces";

type TablePayload = {
  columns: string[];
  rows: Array<Record<string, string | number>>;
};

const registry = new SurfaceRegistry();
registry.register({
  kind: "data.table",
  versions: [1],
  validate(value): TablePayload {
    if (!value || typeof value !== "object") throw new Error("invalid_table");
    return value as TablePayload;
  },
  summarize: (payload) => `${payload.rows.length} rows`,
  getA11yLabel: (payload) => `Data table with ${payload.rows.length} rows`,
});
```

Real applications should use a schema validator such as Zod, Valibot or JSON Schema inside `validate`.

## React plugin

```tsx
import { ReactSurfaceRegistry } from "simplia-agent-chat/react";

const registry = new ReactSurfaceRegistry();
registry.register({
  kind: "content.publication-preview",
  versions: [1],
  validate: parsePublicationPreview,
  summarize: (payload) => payload.title,
  getA11yLabel: (payload) => `Publication preview: ${payload.title}`,
  component: PublicationPreview,
});
```

Renderers receive a validated block and an optional `onAction`. They must not execute mutations directly.

## Placement

`presentation.preferredSurface` tells a client where a trusted surface should appear. It is not a permission grant and does not change reducer behavior.

- Missing `preferredSurface` defaults to `inline`.
- Unknown placement values also default to `inline`.
- `inline` stays in the transcript, including thread-level surfaces and surfaces attached to a turn.
- `panel` is omitted from the transcript and rendered once in the React shell's default artifact stage through `SurfaceHost`.
- `fullscreen` is host-owned. The library never renders it inline and never places it in a modal.

`selectThreadSurfaces(state, threadId, preferredSurface?)` is the pure selector for this split. It returns the original block objects in deterministic state order and does not mutate them. Omit the placement argument to receive every surface that belongs to the thread.

The default artifact stage is additive. Hosts localize its heading with `artifactStageLabel` or replace it with `renderArtifactStage` without forking `ChatTimeline`. Fullscreen surfaces render only when the host supplies `renderFullscreenSurfaces`. Existing consumers that never emit panel or fullscreen surfaces keep the single-column shell.

Unknown or invalid panel surfaces still fail closed. Custom stage and fullscreen slots receive the original blocks, including payload; applications that replace the default stage remain responsible for payload safety.

## Naming

Use reverse-domain-like application namespaces:

- `acv2.execution-plan`
- `content.publication-preview`
- `content.image-review`
- `data.table`
- `data.chart`
- `billing.invoice-preview`
- `seo.keyword-cluster`
- `web.page-preview`

## Failure behavior

`SurfaceHost` fails closed when:

- no plugin is registered for the block kind or schema version;
- `validate` throws;
- `getA11yLabel` throws;
- `summarize` throws;
- the renderer throws.

The built-in fallback may show only the surface kind, schema version and trusted `presentation.title`. It never renders the raw payload or exception text. Renderer exceptions stay inside the existing error boundary and use the same fallback.

A custom `fallback` receives the original block, including payload. The host does not sanitize that argument. Applications that supply a custom fallback are responsible for payload safety and must not render raw unknown payloads or exception messages.

## Actions

Create commands with `createSurfaceActionCommand`. The command binds action, surface revision, thread and idempotency key. The server still owns authorization, validation and execution.

### Durable action receipts

`DOMAIN_ACTIONS_V1` adds a provider-neutral receipt contract for mutations initiated by a trusted surface renderer. The client owns interaction state; the application server still owns authorization, schema validation, compare-and-swap checks, persistence, and the domain mutation.

```ts
import {
  createSurfaceActionState,
  beginSurfaceAction,
  applySurfaceActionReceipt,
  type SurfaceActionTransport,
} from "simplia-agent-chat/core";

const transport: SurfaceActionTransport = {
  execute: (command, options) => api.executeAction(command, options),
  getReceipt: (idempotencyKey, options) => api.getActionReceipt(idempotencyKey, options),
  abandonUnknown: (idempotencyKey, options) => api.abandonAction(idempotencyKey, options),
};

let state = createSurfaceActionState();
const started = beginSurfaceAction(state, command);
if (started.accepted) {
  const receipt = await transport.execute(command);
  state = applySurfaceActionReceipt(started.state, started.operationId, receipt);
}
```

Receipts have one of these statuses:

- `pending`: accepted but not terminal, including HTTP 202 or an application `in_progress` response;
- `confirming`: a receipt lookup or explicit abandonment is in flight;
- `succeeded`: the mutation completed, including an idempotent replay of an earlier success;
- `conflicted`: the server rejected the bound surface revision or another compare-and-swap precondition;
- `failed`: the server authoritatively reports failure;
- `unknown`: a dispatched request has no authoritative outcome.

The pure state machine rejects double submission and ignores stale asynchronous results by operation ID. It captures a deeply cloned and frozen command before dispatch, so later renderer mutations cannot alter the operation. `retrySurfaceAction` is available only after `failed` or `conflicted` when the authoritative error explicitly sets `retryable: true`; missing or false retryability fails closed. A retry takes a fresh immutable snapshot of the captured command and reuses its idempotency key. A pending or unknown action must be reconciled with `getReceipt`; it must not be replayed under a new key.

`actionId` and `surfaceId` are opaque strings. Keep `actionId` as the stable renderer-facing identifier declared by `SurfaceActionRef` (for example, `apply-proposal`); do not require it to be a UUID. An application may use a UUID for `surfaceId` or `receiptId` without making that format part of the shared contract.

Persist the complete `command` and `receipt` pair, plus `abandonedUnknown` when set, needed by `createSurfaceActionState` to recover after reload. Hydration rejects a command without a receipt, a receipt without a command, and mismatched keys. A persisted `confirming` receipt has no live request after reload, so hydration safely normalizes it to reconciliable `unknown`. Pending and confirming receipts never retain stale `result` or `error` fields. If a receipt lookup fails, an authoritative prior `pending` receipt stays pending; an unknown outcome stays unknown. Do not persist provider credentials in either object.

Abandoning `unknown` requires `acknowledgePossibleEffects: true`. It tells the server that the operator accepts that effects may already have happened. It is terminal for that controller: once dispatched, `abandonedUnknown` must be persisted and no later receipt can enable `execute` retry, even if a remote failure incorrectly says `retryable: true`. It is not a retry, does not call `execute`, and must not be presented as proof that the original mutation did or did not run.

### React controller

`useSurfaceAction` wraps the same state machine without rendering domain UI:

```tsx
const action = useSurfaceAction({ transport, initialState: persistedAction });

<button
  type="button"
  disabled={action.busy}
  aria-busy={action.busy}
  onClick={() => void action.execute(command)}
>
  Apply proposal
</button>
```

The consuming application is responsible for accessible labels, confirmation UI for dangerous actions, and safe rendering of receipt results. The hook exposes `execute`, `retry`, `reconcile`, and `abandonUnknown`; it contains no provider callbacks, credentials, application URLs, or business mutation logic. Every transport call receives an `AbortSignal`, and the active signal is aborted when the component unmounts. A transport should honor that signal, although the hook also fences late results and never waits for cancellation during unmount.
