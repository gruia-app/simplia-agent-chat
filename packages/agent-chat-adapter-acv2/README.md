# @simplia/agent-chat-adapter-acv2

Optional adapter for ACV2 durable run events and the ACV2 provider capability profiles.

```bash
pnpm add @simplia/agent-chat-core @simplia/agent-chat-adapter-acv2
```

```ts
import { acv2PmAdapter } from "@simplia/agent-chat-adapter-acv2";

const events = acv2PmAdapter.normalize(durableEvent, context);
```

Native run, message, tool, and fallback system IDs are scoped by `context.threadId` without double-prefixing an already-scoped identifier. Preserve native run and tool identity from `provider.nativeTurnId` / `provider.nativeThreadId` or item `metadata.nativeItemId`.

A durable `cursor` emits stream metadata. Caller `streamId` is preserved; otherwise the adapter uses a deterministic per-thread, per-run stream ID. Sequence on the adapter context is not enough to emit stream metadata when no cursor exists.

Capability support does not grant filesystem or terminal permission. Consumers must negotiate grants independently.

Apache-2.0.
