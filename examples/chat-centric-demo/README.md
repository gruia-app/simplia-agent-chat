# Chat-centric demo

Vite/React reproduction of `fixtures/M-prototipo.reference.html`. Chat, proposal cards, confirmation, undo toast, memory and BYO panels come from `@simplia/agent-chat-react`; the consuming app owns its classic views and mock business mutations.

The demo uses `createAgentServerClient` with an injected in-memory `fetch` implementing SPEC-CHAT-F1 §5. It keeps one-use apply token hashes, rejects a higher recalculated cost with 409, and delays the campaign send for a 30-second grace period that can be cancelled without an effect. State resets on reload. The “Simular subida de coste” control exposes the 409 path.

Run `pnpm --dir examples/chat-centric-demo build` for a production build and `pnpm qa:demo` for the browser/axe checks. The QA runner builds the packages and serves the built demo to Playwright in-process; it starts no application server.
