# Simplia Agent Chat React

Accessible React components for `simplia-agent-chat/core`.

The package includes the chat shell, timeline, IME-safe composer, honest interrupt request chrome, first-class approvals and questions, follow-scroll state machine and a trusted surface registry with validation and fail-closed rendering.

```bash
pnpm add "simplia-agent-chat@github:gruia-app/simplia-agent-chat#<reviewed-commit-sha>"
```

```tsx
import { AgentChatShell, ReactSurfaceRegistry } from "simplia-agent-chat/react";
import "simplia-agent-chat/react/styles.css";
```

React 18.2 and React 19 are supported through peer dependencies.

## Run status and interrupt

`selectThreadRunState` is derived from protocol entities. `onInterrupt(turn)` only requests a stop. The shell never mutates `ChatState` and never labels a turn cancelled or interrupted until a protocol event says so. Double requests for the same active turn are ignored while submitting or submitted. A rejected request unlocks retry and shows `interruptError` without exception text. Stop stays separate from Send and appears only when an active turn and `onInterrupt` both exist.

`renderRunStatus` replaces the default chrome. `ChatRunStatus` is usable standalone with `copy` and `theme`.

## Composer

The default composer keeps the textarea editable while busy so the operator can draft the next instruction. A local submitting fence sends a snapshot only once. If `onSubmit` throws or rejects, the snapshot is restored only when the operator has not typed a replacement. Optional `actions` do not submit the form. Optional `onDraftChange` observes the draft. `AgentChatShell.composerActions` is passed only to the default composer.

## Message rendering

`renderMessage` remains an application-owned slot with no Markdown or HTML parser. The default is React-escaped `item.text`. Renderer failures fall back to that escaped text, or `messageRendererFallback` when empty, without exception text or raw metadata/input/output. Tool and command work details never call `renderMessage`.

## Pending interactions

Approval cards require an inline second step. Choosing a decision shows Confirm and Back; `onResolve` runs only after Confirm. The host never uses `window.confirm`. Questions and elicitation stay one-submit.

While `onResolve` is pending, that card sets `aria-busy`, disables every control, and ignores repeated submissions. If the promise rejects, controls unlock so the operator can retry. The card does not render `interaction.payload`. Answer fields are labelled with the interaction title.

Primary styling uses an exact decision allowlist (`approve`, `approved`, `allow`, `yes`, `accept`, `confirm`). Substring matches such as `disapprove` are never treated as affirmative.

## Surfaces

`SurfaceHost` fails closed when `validate`, `getA11yLabel`, or `summarize` throws, when no trusted renderer is registered, or when the renderer throws. The built-in fallback may show only kind, schema version, and trusted `presentation.title`. It never renders the raw payload or exception text.

A custom `fallback` receives the original block, including payload. The host does not sanitize that argument. Applications that supply a custom fallback are responsible for payload safety and must not render raw unknown payloads or exception messages.

Apache-2.0.
