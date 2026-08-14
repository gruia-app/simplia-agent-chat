# @simplia/agent-chat-adapter-acv2

Optional adapter for ACV2 durable run events and the ACV2 provider capability profiles.

```bash
pnpm add @simplia/agent-chat-core @simplia/agent-chat-adapter-acv2
```

```ts
import { acv2PmAdapter } from "@simplia/agent-chat-adapter-acv2";

const events = acv2PmAdapter.normalize(durableEvent, context);
```

For synchronous direct-agent chat, `acv2DirectChatAdapter` accepts one request/response exchange and emits a turn, message, tool and latest-exchange usage batch. The host owns thread creation and metadata, so later exchanges cannot replace title or existing thread metadata. Callers must provide a stable `exchange_id`. Native `conversation_id`, CLI `session_id`, provider runtime alias and tool IDs remain available without becoming global entity IDs.

Native run, message, tool, and fallback system IDs are scoped by `context.threadId` without double-prefixing an already-scoped identifier. Preserve native run and tool identity from `provider.nativeTurnId` / `provider.nativeThreadId` or item `metadata.nativeItemId`.

A durable `cursor` emits stream metadata. Caller `streamId` is preserved; otherwise the adapter uses a deterministic per-thread, per-run stream ID. Sequence on the adapter context is not enough to emit stream metadata when no cursor exists.

Capability support does not grant filesystem or terminal permission. Consumers must negotiate grants independently.

Apache-2.0.
