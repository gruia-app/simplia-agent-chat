---
"simplia-agent-chat": minor
"@simplia/agent-chat-react": minor
---

Add a `high-contrast` theme preset on the shared semantic token set.

- `AgentChatTheme` gains `"high-contrast"`; every `theme` prop and `sacThemeAttributes` accepts it, emitting `data-sac-theme="high-contrast"`.
- The preset keeps the flat, application-owned style: black surfaces, white text, saturated status hues and a bright blue focus/accent. Body, muted and strong text meet WCAG 2.2 AAA (≥ 7:1) on every surface; status and accent text meet AA; strong borders and the focus ring meet the 3:1 non-text minimum.
- `docs/THEMING.md` documents the preset alongside the existing token table; contrast ratios are enforced by tests.
