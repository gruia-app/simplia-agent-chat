# Roadmap

## Before 1.0

- Virtualized or paged timeline contract for very long sessions.
- Stable snapshot and replay persistence interface. Completed as additive `ChatRuntime` plus a caller-owned `ChatPersistencePort` (`commitChatEvent`, `hydrateChatRuntime`, `thread.snapshot` wire format). Application storage remains consumer-owned.
- Framework-neutral rendering examples beyond React.
- Surface schema conformance kit and reusable test helpers.
- Provider conformance suites for live Codex, LangChain and OpenAI-compatible transports.
- Theme contract with documented token groups and high-contrast examples.
- Versioned migration guide for every protocol or surface breaking change.

## Ecosystem adoption

Applications adopt the library one at a time behind feature flags. Read-only timelines come first, then pending interactions, then idempotent domain actions. A package release does not prove an application rollout or production deployment.

Roadmap items are not commitments to a date. Open a discussion before implementing a large public API.
