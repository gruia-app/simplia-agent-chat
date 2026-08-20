# Design language

## Direction: calm operations desk

Simplia Agent Chat is shared infrastructure inside products that already have a brand. It should feel like a calm operations desk: familiar conversation on one side, inspectable work on the other, and human decisions that are impossible to mistake for ordinary assistant text.

The shell supplies hierarchy, rhythm, interaction states and safe fallbacks. The consuming application supplies its name, accent, domain artifacts and voice. The library must never present `SHARED_AGENT_CHAT`, a provider name or generic AI theatre as product branding.

## Visual principles

1. Use one strong page hierarchy. Avoid dashboards made from nested cards.
2. Prefer flat surfaces, restrained borders and tonal separation over shadows, glass, glow or gradients.
3. Keep body copy in a readable system sans. Reserve mono for compact metadata, status codes and technical evidence.
4. Let the application accent identify primary actions and focus. Success, warning and danger remain semantic and cannot rely on color alone.
5. Keep transcript and artifact stage independently scrollable. Collapse by the chat container width, not only the viewport.
6. Default copy is concise, provider-neutral English. Every library-owned string and dynamic accessible label must be replaceable without changing command values or event payloads.

## Themes

The current dark palette remains the compatibility default. A built-in warm-light preset supports the editorial workspace shown in the product references. Both palettes consume the same semantic tokens; applications can override those tokens rather than fork CSS. Token names, loading order and the `.sac-theme` wrapper are documented in `docs/THEMING.md`.

Semantic groups:

- canvas, surface, elevated surface and subtle surface;
- text, strong text and muted text;
- border and strong border;
- accent, accent emphasis and accent contrast;
- success, warning and danger, each with readable foregrounds;
- focus ring;
- body and mono font families;
- compact radius and control radius.

Legacy `--sac-*` color variables remain aliases during migration. New component rules should consume semantic tokens.

## Copy and ownership

- Omit library branding by default. An application may provide a small header label or its own node.
- Translate display labels, hints, statuses and ARIA text through one shared copy contract (`AgentChatCopy` / `copy` on the React components). Display-only: decision identifiers passed to `onResolve` stay the original protocol values.
- Preserve decision identifiers exactly when resolving interactions. A translated label never changes the value sent to `onResolve`.
- Keep failure messages actionable and safe. Never interpolate raw unknown payloads or exception strings into the UI.
- Use verbs that describe the action: Send, Confirm, Back, Retry, Stop. Avoid anthropomorphic filler and celebratory copy.
- A stop request is not a completed interrupt. Show Stop requested until a protocol event confirms cancelled or interrupted.
- Application message renderers fail closed to escaped item text, never to exception text or raw metadata.

## Interaction and accessibility

- Meet WCAG 2.2 AA in both bundled themes.
- Preserve visible keyboard focus, IME-safe composition, coarse-pointer targets and reduced-motion behavior.
- Streaming transcript updates remain `aria-live="off"`; required human actions use explicit landmarks and labels.
- Confirmation remains a separate step for approval interactions.
- Keep Stop separate from Send. Show Stop only when an active turn and an interrupt handler both exist.
- Theme and copy overrides must work for standalone exported components as well as `AgentChatShell`.

## Anti-patterns

- provider-specific branches or application business terms in shared components;
- hard-coded uppercase branding;
- raw protocol status used as the only user-facing label when a copy formatter is available;
- changing decision/event values while localizing labels;
- viewport-only responsive rules;
- decorative animation, gradients, glass, glow or deep shadow stacks;
- broad theme objects that inject arbitrary CSS or executable renderers.
