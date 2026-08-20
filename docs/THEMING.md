# Theming

The React package ships two palettes that share one semantic token set. The dark palette is the compatibility default. A warm-light preset supports a calm editorial operations workspace. Both are flat, restrained and application-owned: no gradients, glass, glow, deep shadows or provider branding.

Copy changes display labels only. Event IDs, decision values, status values and payloads stay protocol data.

## Token table

Legacy `--sac-*` color variables remain the default inputs. Component rules consume the semantic tokens.

| Token | Role | Dark default input |
| --- | --- | --- |
| `--sac-color-canvas` | Page/shell background | `--sac-bg` |
| `--sac-color-surface` | Panels and surfaces | `--sac-panel` |
| `--sac-color-surface-elevated` | Header, rails, user bubbles | `--sac-panel-alt` |
| `--sac-color-surface-subtle` | Composer, code, insets | `--sac-deep` |
| `--sac-color-text` | Body text | `--sac-text` |
| `--sac-color-text-strong` | Titles and emphasis | `--sac-text-strong` |
| `--sac-color-text-muted` | Meta, hints, placeholders | `--sac-muted` |
| `--sac-color-border` | Default separators | `--sac-border` |
| `--sac-color-border-strong` | Controls and user bubbles | `--sac-border-strong` |
| `--sac-color-accent` | Primary hue and focus-within | `--sac-blue` |
| `--sac-color-accent-emphasis` | Primary button fill | `--sac-blue-strong` |
| `--sac-color-accent-contrast` | Text on accent fills | `--sac-text-strong` |
| `--sac-color-accent-border` | Accent outlines | `--sac-blue-border` |
| `--sac-color-accent-soft` | Accent hover border | `--sac-blue-soft` |
| `--sac-color-accent-fg` | Readable accent text | `--sac-blue-text` |
| `--sac-color-success` / `--sac-color-success-fg` | Completed work | `--sac-green` / `--sac-green-text` |
| `--sac-color-warning` / `--sac-color-warning-fg` | Waiting / approval | `--sac-amber` / `--sac-amber-text` |
| `--sac-color-danger` / `--sac-color-danger-fg` | Failed / declined | `--sac-red` / `--sac-red-text` |
| `--sac-color-focus` | Keyboard focus ring | `--sac-blue` |
| `--sac-color-control-hover` | Button hover fill | `--sac-button-hover` |
| `--sac-color-interaction` | Pending interaction rail | `--sac-interaction-bg` |
| `--sac-font-body` | Body copy and controls | system sans |
| `--sac-font-mono` | Metadata, status, evidence | system mono |
| `--sac-radius-compact` | Buttons and compact inputs | `0.22rem` |
| `--sac-radius-control` | Composer and user bubbles | `0.4rem` |

## Dark default

`.sac-shell` and `.sac-theme` resolve to the previous dark palette when `theme` is omitted. `AgentChatShell` sets `data-sac-theme` only when the `theme` prop is supplied. Omitted still looks like `theme="dark"`.

## Warm-light preset

Pass `theme="light"` to `AgentChatShell` or a standalone component. The same attribute is `[data-sac-theme="light"]` on `.sac-shell` or `.sac-theme`. Colors are warm paper, ink text and a restrained navy accent. Status, muted text, placeholders and primary controls meet WCAG 2.2 AA. Meaning never depends on color alone.

## `.sac-theme`

Standalone `ChatComposer`, `ChatTimeline`, `PendingInteractions` and `SurfaceHost` add `.sac-theme` so they can be used outside the shell. Optional `theme="dark" | "light"` sets `data-sac-theme`. Applications may also wrap a group of standalone components:

```html
<div class="sac-theme" data-sac-theme="light">
  <!-- standalone chat pieces -->
</div>
```

Standalone roots without their own `theme` inherit tokens from the nearest `.sac-shell` or `.sac-theme` wrapper. Pass a component-level `theme` only when that component must intentionally override its ancestor.

## Application overrides

Load library CSS first, then set semantic tokens. Later rules with the same specificity win; the library does not use `!important` for color.

```css
@import "simplia-agent-chat/react/styles.css";

.sac-shell {
  --sac-color-accent: #0f3d6e;
  --sac-color-accent-emphasis: #0b2f54;
  --sac-font-body: "Source Sans 3", ui-sans-serif, system-ui, sans-serif;
}
```

Override `--sac-color-*`, fonts and radii. Legacy `--sac-*` inputs still work for the values they feed, but new rules should target semantic tokens.

Do not pass an executable theme object. The public contract is the `theme` union plus CSS variables.

## Loading order

1. `import "simplia-agent-chat/react/styles.css";`
2. Application token overrides.
3. Application layout/brand CSS.

## Accessibility

Both bundled palettes target WCAG 2.2 AA for body text, muted text, placeholders, status text and controls. Focus remains visible. Coarse pointers keep 2.75rem targets. `prefers-reduced-motion` disables smooth scrolling. Transcript streaming stays `aria-live="off"`. Status is labeled in text, not color alone.
