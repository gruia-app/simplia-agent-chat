# Simplia Agent Chat core

Headless TypeScript runtime for provider-neutral agent chat.

It provides:

- typed thread, turn, item, interaction and surface events;
- runtime envelope validation via `validateChatEvent`;
- derived operational run state (`selectThreadRunState`, `selectActiveTurn`) without mutating protocol entities;
- deterministic replay with sequence-gap and duplicate detection;
- snapshot gap recovery when the snapshot carries stream metadata;
- optional `ChatRuntime` over that same reducer, plus a caller-owned snapshot/journal persistence port;
- versioned application surfaces and idempotent actions;
- provider capability negotiation with separate permission grants;
- bounded SSE decoding;
- adapters for Codex, LangChain and OpenAI-compatible/OpenRouter streams.

```bash
pnpm add "simplia-agent-chat@github:gruia-app/simplia-agent-chat#<reviewed-commit-sha>"
```

```ts
import { validateChatEvent } from "simplia-agent-chat/core/protocol";
import { reduceChatEvent, createInitialChatState } from "simplia-agent-chat/core/state";

const validated = validateChatEvent(event);
if (validated.ok) {
  let state = createInitialChatState();
  state = reduceChatEvent(state, validated.event).state;
}
```

A recovery `thread.snapshot` MUST include stream metadata so the reducer can adopt that stream's high-water mark.

Direct reducer use remains the integration default. Opt into `createChatRuntime`, `commitChatEvent`, and `hydrateChatRuntime` when the application wants in-process subscribers and a caller-owned journal. `createMemoryChatPersistence` is a volatile test/lab store, not a production backend.

```ts
import { createChatRuntime } from "simplia-agent-chat/core/runtime";
import { commitChatEvent, hydrateChatRuntime } from "simplia-agent-chat/core/persistence";

const hydrated = await hydrateChatRuntime(persistence, { threadId, limit: 256 });
if (hydrated.ok) {
  const committed = await commitChatEvent(hydrated.runtime, persistence, event);
  if (committed.ok) render(hydrated.runtime.getState());
}
```

Journal pages are bounded and use an opaque cursor. Do not treat a stream sequence as a storage cursor. Pending interactions are ordinary snapshot and event data. One durable stream per thread is the supported shape today; unsequenced events are unsafe as durable records. Append success followed by a crash is healed by hydration — the port does not claim atomicity with in-memory state.

Transport, persistence, authorization and domain operations remain application responsibilities.

Apache-2.0.
