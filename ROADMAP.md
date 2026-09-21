# Roadmap

## Before 1.0

- Virtualized or paged timeline contract for very long sessions. Completed as additive `selectTimelinePage` with id-based cursors (`turn:`-prefixed, foreign/malformed cursors fail closed) over the canonical `selectThreadTurns` order. Row measurement, virtualization library and scroll anchoring remain host-owned.
- Stable snapshot and replay persistence interface. Completed as additive `ChatRuntime` plus a caller-owned `ChatPersistencePort` (`commitChatEvent`, `hydrateChatRuntime`, `thread.snapshot` wire format). Application storage remains consumer-owned.
- Framework-neutral rendering examples beyond React. Completed as `examples/headless-lab`: dependency-free Node example rendering escaped timeline HTML through `selectTimelinePage` plus suggestion resolution, with `node --test` coverage.
- Surface schema conformance kit and reusable test helpers. Completed as runner-agnostic `runCoreConformance` plus React markup helpers `runWorkspaceMarkupConformance` and `runSurfaceHostMarkupConformance`. Live provider conformance remains open; host-side timeline virtualization consumes `selectTimelinePage`.
- Provider conformance suites for live Codex, LangChain and OpenAI-compatible transports.
- Theme contract with documented token groups and high-contrast examples. Completed: semantic token table in `docs/THEMING.md` plus `theme="high-contrast"` preset (AAA body text, AA status text, 3:1 borders/focus) verified by contrast-ratio tests.
- Versioned migration guide for every protocol or surface breaking change. Completed as `docs/MIGRATION.md` covering the three version axes (package semver, `CHAT_PROTOCOL_VERSION`, per-kind `schemaVersion`) with an entry format; the release-policy test asserts the guide tracks the live protocol major.

## Ecosystem adoption

Applications adopt the library one at a time behind feature flags. Read-only timelines come first, then pending interactions, then idempotent domain actions. A package release does not prove an application rollout or production deployment.

Roadmap items are not commitments to a date. Open a discussion before implementing a large public API.
