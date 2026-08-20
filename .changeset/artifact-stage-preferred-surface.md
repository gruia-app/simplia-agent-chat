---
"simplia-agent-chat": minor
"@simplia/agent-chat-core": minor
"@simplia/agent-chat-react": minor
---

Honor `SurfaceBlock.presentation.preferredSurface` with an additive artifact stage.

- `selectThreadSurfaces()` returns thread surfaces in deterministic state order and treats missing or unknown placement as inline.
- The React timeline renders only inline surfaces. Panel surfaces appear once in a default accessible artifact stage, replaceable through `renderArtifactStage`.
- Fullscreen surfaces stay host-owned via `renderFullscreenSurfaces` and are never inlined or shown in a library modal.
