# Architecture

Simplia Agent Chat is split into four layers so applications can share interaction behavior without sharing business logic.

## 1. Protocol

The protocol models threads, turns, typed items, pending interactions, usage and versioned surfaces. Every event has a stable ID. Ordered streams also carry a stream ID and sequence.

The reducer is deterministic and supports:

- duplicate rejection;
- stale and out-of-order detection;
- explicit resynchronization after gaps;
- atomic thread snapshots;
- monotonic terminal turn states;
- revision-bound surface patches;
- bounded warning and replay metadata.

## 2. Provider ports and adapters

`AgentProviderPort` represents a stateful agent capable of tools and interactive requests. `ChatCompletionPort` represents an OpenAI-compatible completion stream. Keeping them separate prevents a simple API from being presented as if it could access files, run commands or request approvals.

Transport adapters normalize external events into the shared protocol. The core ships Codex, LangChain and OpenAI-compatible/OpenRouter adapters. Application-specific transports belong in separate packages.

## 3. Surfaces

A surface is a versioned, JSON-only application artifact such as a publication preview, data table, chart, invoice or deployment report. The core validates the plugin contract; the application validates the actual schema and supplies the renderer.

Surface actions include the surface revision and an idempotency key. A server must reject stale revisions, duplicate effects and unauthorized actions.

## 4. Clients

The React package is one client implementation. Other clients can consume the same state and protocol without React. Web, desktop and native applications may share the kernel while using different component trees.

## Identity and isolation

Thread IDs should be scoped by environment and application in persistent stores. `appKey` and `organizationId` are context, not authorization. Servers derive tenant identity from authenticated membership and revalidate every mutation.

## Persistence contract

A production transport should provide:

1. durable journal append before broadcast;
2. monotonic sequence allocation per stream;
3. replay from a caller-owned cursor;
4. snapshot fallback when replay cannot close a gap;
5. durable pending interactions;
6. idempotent command handling;
7. bounded client and server buffers.

The packages do not prescribe a database or message broker.
