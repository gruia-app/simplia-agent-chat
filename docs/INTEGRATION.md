# Integration guide

## Choose the provider contract

Use an `AgentProviderPort` when the backend has durable sessions, tools, approvals or steering. Use a `ChatCompletionPort` for an OpenAI-compatible response stream. Do not emulate unsupported agent capabilities in the UI.

## Normalize before rendering

Provider SDK or transport events should pass through a `ChatTransportAdapter`. Persist or stream normalized `ChatEvent` envelopes, then reduce them with `reduceChatEvent`.

```ts
import { reduceChatEvent, createInitialChatState } from "@simplia/agent-chat-core/state";
import { codexAppServerAdapter } from "@simplia/agent-chat-core/adapters/codex";

let state = createInitialChatState();
for (const event of codexAppServerAdapter.normalize(notification, context)) {
  state = reduceChatEvent(state, event).state;
}
```

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
/>
```

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

Install `@simplia/agent-chat-adapter-acv2` and normalize durable PM/run events with `acv2PmAdapter`. The package also exposes the nine current provider profiles. Runtime capability discovery should override stale static assumptions, but never grant permission by itself.

## LangChain

`langChainAdapter` supports messages, updates, custom and event modes. Preserve tool-call identity and partial chunks; do not trim meaningful streaming whitespace.

## OpenRouter and other OpenAI-compatible APIs

Use `openRouterAdapter` or `createOpenAiCompatibleAdapter`. These adapters expose chat-completion semantics only. Filesystem, terminal, approval, rollback and subagent features remain unsupported.

## Versioning

Include `protocolVersion` in persisted events and `schemaVersion` in every surface. Reject unknown protocol major versions. Surface plugins may support more than one schema version during migrations.
