---
"@simplia/agent-chat-react": minor
"@simplia/agent-chat-core": patch
"@simplia/agent-chat-adapter-acv2": patch
---

Harden React interaction confirmation and fail-closed surface rendering, and correct Apache license attribution for release packaging.

- `SurfaceHost` fails closed when `validate`, `getA11yLabel`, or `summarize` throws, without exposing payload or exception text.
- Approval decisions require an inline Confirm/Back step; pending cards lock while `onResolve` is in flight.
- Affirmative button styling uses an exact decision allowlist.
- LICENSE appendix copyright is Simplia Agent Chat contributors.
