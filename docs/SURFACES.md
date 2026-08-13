# Surface plugins

Surfaces let applications render domain artifacts without adding domain concepts to the chat kernel.

## Core plugin

```ts
import { SurfaceRegistry } from "@simplia/agent-chat-core/surfaces";

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
import { ReactSurfaceRegistry } from "@simplia/agent-chat-react";

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

Unknown schema versions and validation failures render a safe fallback. Raw untrusted payloads are not displayed. Renderer exceptions are caught by an error boundary and use the same fallback.

## Actions

Create commands with `createSurfaceActionCommand`. The command binds action, surface revision, thread and idempotency key. The server still owns authorization, validation and execution.
