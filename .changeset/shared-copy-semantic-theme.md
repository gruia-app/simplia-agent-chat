---
"simplia-agent-chat": minor
"@simplia/agent-chat-react": minor
---

Add a shared copy contract, application-owned header labeling, and semantic dark/light theming to the React shell.

- `AgentChatCopy` / `resolveAgentChatCopy()` replace library-owned strings without changing event IDs, decision values, status values or payloads.
- `AgentChatShell` omits library branding by default and accepts optional `headerLabel` and `theme`.
- Semantic CSS tokens power the compatibility dark palette and a warm-light preset; standalone components use `.sac-theme`.
