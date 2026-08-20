---
"simplia-agent-chat": minor
"@simplia/agent-chat-core": minor
"@simplia/agent-chat-react": minor
---

Add a lightweight AgentChatWorkspace layout host and packaged surface/replay conformance helpers.

- `AgentChatWorkspace` arranges application-owned history, conversation, optional work queue and optional workbench slots without changing `AgentChatShell`.
- Core exports runner-agnostic `runCoreConformance`, `assertConformance` and `formatConformanceReport` with fail-closed, canary-safe details.
- React exports markup conformance helpers that reuse the core report model. Import assertions from `simplia-agent-chat/core/conformance`.
