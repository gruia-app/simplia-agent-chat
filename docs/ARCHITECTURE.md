# Architecture

Simplia Agent Chat is split into four layers so applications can share interaction behavior without sharing business logic.

## 1. Protocol

The protocol models threads, turns, typed items, pending interactions, usage and versioned surfaces. Every event has a stable ID. Ordered streams also carry a stream ID and sequence.

The reducer is deterministic and supports:

- runtime envelope validation for unknown input;
- rejection of unsupported protocol majors and unknown event types;
- duplicate rejection;
- stale and out-of-order detection;
- explicit resynchronization after gaps;
- atomic thread snapshots, including gap recovery from a snapshot that carries stream metadata;
- monotonic terminal turn states;
- revision-bound surface patches;
- bounded warning and replay metadata.

`validateChatEvent` accepts unknown input and returns a discriminated success or error result. It never throws and never applies state. `reduceChatEvent` uses the same checks so JavaScript callers cannot mutate state with malformed, future, or unsupported events. Rejected events do not consume event IDs.

A recovery `thread.snapshot` MUST carry `stream.id` and `stream.sequence`. The reducer then installs the snapshot atomically, adopts that exact stream high-water mark, and clears that stream's resync request. Snapshots without stream metadata cannot close a sequence gap.

Snapshot replacement only removes and installs entities that belong to the snapshot thread. Envelope `threadId` / `turnId` values must agree with payload identity. Colliding identifiers from another thread are rejected rather than overwritten.

## 2. Provider ports and adapters

`AgentProviderPort` represents a stateful agent capable of tools and interactive requests. `ChatCompletionPort` represents an OpenAI-compatible completion stream. Keeping them separate prevents a simple API from being presented as if it could access files, run commands or request approvals.

Transport adapters normalize external events into the shared protocol. The core ships Codex, LangChain and OpenAI-compatible/OpenRouter adapters. Those adapters scope provider-native turn, item, surface and interaction IDs by thread and keep the native identifiers in provider or item metadata. They do not use a shared literal `unknown` as a durable entity ID. Application-specific transports belong in separate packages.

## 3. Surfaces

A surface is a versioned, JSON-only application artifact such as a publication preview, data table, chart, invoice or deployment report. The core validates the plugin contract; the application validates the actual schema and supplies the renderer.

Surface actions include the surface revision and an idempotency key. A server must reject stale revisions, duplicate effects and unauthorized actions.

## 4. Clients

The React package is one client implementation. Other clients can consume the same state and protocol without React. Web, desktop and native applications may share the kernel while using different component trees.

`AgentChatWorkspace` is a layout host, not a second shell. It arranges application-owned history, conversation, optional work queue and optional workbench slots in a fixed DOM order. `AgentChatShell` stays the conversation surface and does not gain workspace props. The host owns available height, pane visibility and any narrow-container switcher.

Runner-agnostic conformance helpers live in core (`runCoreConformance`, `assertConformance`, `formatConformanceReport`). They check plugin registration, fail-closed decode, canary isolation, action idempotency and optional deterministic replay without a test runner, filesystem, DOM or network. Reports use fixed safe details and never echo payloads, canaries, summaries, plugin exceptions or event objects.

## Identity and isolation

Thread IDs should be scoped by environment and application in persistent stores. `appKey` and `organizationId` are context, not authorization. Servers derive tenant identity from authenticated membership and revalidate every mutation.

## Runtime

`createChatRuntime` is an optional in-process facade over `reduceChatEvent`. `apply(event)` is exactly `reduceChatEvent(currentState, event)`: it adopts `result.state` and notifies a snapshot of subscribers only when that state reference changes. Stream gaps therefore notify (resync metadata is new state); duplicate, stale, invalid, and conflict no-ops do not. Subscribe does not emit immediately. Listener exceptions are isolated and cannot change the `ReduceResult`. Existing `createInitialChatState`, `reduceChatEvent`, and `replayChatEvents` remain the projection API.

## Persistence contract

Applications own durable storage. The core exposes a caller-implemented `ChatPersistencePort` with no credentials, database, or transport of its own:

1. `append` a validated `ChatEvent` before `runtime.apply` / broadcast;
2. monotonic sequence allocation per stream, done by the application — the core never mints or reorders sequences;
3. `readJournal` with opaque bounded pagination (`threadId`, optional `streamId`, optional opaque `cursor`, optional snapshot high-water `after: { streamId, sequence }`, required finite positive `limit`);
4. `loadSnapshot` of untrusted snapshot bytes and optional `saveSnapshot` of the existing `thread.snapshot` protocol event. A recovery snapshot MUST include envelope stream metadata; a snapshot without stream metadata cannot close a sequence gap;
5. pending interactions travel as ordinary snapshot and journal data;
6. idempotent command handling at the application boundary;
7. bounded client and server buffers. When `done` is false, empty pages, missing cursors, and repeated non-advancing cursors must fail closed.

`commitChatEvent` validates, serializes concurrent calls per runtime in call order, awaits `append`, then `apply`. A fulfilled append is persisted even if the reducer reports duplicate, gap, or conflict; the journal is not rolled back. `hydrateChatRuntime` rebuilds a new runtime from an optional snapshot plus journal pages and never notifies during hydration. Append success followed by a process crash is healed by hydration — the port does not claim persistence-plus-memory atomicity.

Snapshot or journal read failures return `load_failed` with the original error instead of installing partial state. An append rejection returns `append_failed` and leaves memory untouched; it means durability was not confirmed, not that every external store can prove the write was absent.

`createMemoryChatPersistence` is an explicitly volatile test/lab store. It is not durable.

Today, applications should keep one durable stream per thread. Unsequenced events retain existing reducer semantics but are unsafe as durable records because they cannot participate in `after` high-water filtering.

The packages do not prescribe a database, message broker, IndexedDB, filesystem, or network client.
