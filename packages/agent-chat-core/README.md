# Simplia Agent Chat core

Headless TypeScript runtime for provider-neutral agent chat.

It provides:

- typed thread, turn, item, interaction and surface events;
- runtime envelope validation via `validateChatEvent`;
- deterministic replay with sequence-gap and duplicate detection;
- snapshot gap recovery when the snapshot carries stream metadata;
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

Transport, persistence, authorization and domain operations remain application responsibilities.

Apache-2.0.
