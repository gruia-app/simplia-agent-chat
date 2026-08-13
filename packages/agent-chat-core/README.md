# @simplia/agent-chat-core

Headless TypeScript runtime for provider-neutral agent chat.

It provides:

- typed thread, turn, item, interaction and surface events;
- deterministic replay with sequence-gap and duplicate detection;
- versioned application surfaces and idempotent actions;
- provider capability negotiation with separate permission grants;
- bounded SSE decoding;
- adapters for Codex, LangChain and OpenAI-compatible/OpenRouter streams.

```bash
pnpm add @simplia/agent-chat-core
```

```ts
import { reduceChatEvent, createInitialChatState } from "@simplia/agent-chat-core/state";

let state = createInitialChatState();
state = reduceChatEvent(state, event).state;
```

Transport, persistence, authorization and domain operations remain application responsibilities.

Apache-2.0.
