"use client";

import { Component, type ComponentType, type ReactNode } from "react";
import {
  SurfaceRegistry,
  type JsonValue,
  type SurfaceActionRef,
  type SurfaceBlock,
  type SurfacePlugin,
} from "simplia-agent-chat/core";
import {
  resolveAgentChatCopy,
  sacThemeAttributes,
  type AgentChatCopy,
  type AgentChatCopyOverrides,
  type AgentChatTheme,
} from "./copy.js";

export interface SurfaceRendererProps<TPayload extends JsonValue> {
  block: SurfaceBlock<TPayload>;
  onAction?: ((action: SurfaceActionRef, input?: JsonValue) => void) | undefined;
}

export interface ReactSurfacePlugin<TPayload extends JsonValue = JsonValue>
  extends SurfacePlugin<TPayload> {
  component: ComponentType<SurfaceRendererProps<TPayload>>;
}

interface DecodedReactSurface {
  block: SurfaceBlock;
  plugin: ReactSurfacePlugin;
}

class SurfaceErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export class ReactSurfaceRegistry {
  readonly #core = new SurfaceRegistry();
  readonly #plugins = new Map<string, ReactSurfacePlugin>();

  register<TPayload extends JsonValue>(plugin: ReactSurfacePlugin<TPayload>): () => void {
    const unregisterCore = this.#core.register(plugin);
    const registered = plugin as unknown as ReactSurfacePlugin;
    this.#plugins.set(plugin.kind, registered);
    return () => {
      unregisterCore();
      if (this.#plugins.get(plugin.kind) === registered) this.#plugins.delete(plugin.kind);
    };
  }

  decode(block: SurfaceBlock): DecodedReactSurface | undefined {
    const decoded = this.#core.decode(block);
    if (!decoded) return undefined;
    const plugin = this.#plugins.get(block.kind);
    return plugin ? { block: decoded.block, plugin } : undefined;
  }

  kinds(): string[] {
    return this.#core.kinds();
  }
}

export interface SurfaceHostProps {
  block: SurfaceBlock;
  registry: ReactSurfaceRegistry;
  onAction?: ((block: SurfaceBlock, action: SurfaceActionRef, input?: JsonValue) => void) | undefined;
  fallback?: ((block: SurfaceBlock, reason: "unknown" | "invalid") => ReactNode) | undefined;
  copy?: AgentChatCopyOverrides | undefined;
  theme?: AgentChatTheme | undefined;
}

function trustedPresentationTitle(block: SurfaceBlock): string {
  return block.presentation?.title?.trim() || block.kind;
}

function SafeSurfaceFallback({
  block,
  reason,
  copy,
  theme,
}: {
  block: SurfaceBlock;
  reason: "unknown" | "invalid";
  copy: AgentChatCopy;
  theme: AgentChatTheme | undefined;
}) {
  const title = block.presentation?.title?.trim() || undefined;
  return (
    <section
      className="sac-surface-fallback sac-theme"
      aria-label={copy.surfaceFallbackAriaLabel(block.kind, block.schemaVersion, title)}
      {...sacThemeAttributes(theme)}
    >
      <span className="sac-eyebrow">{copy.surfaceUnavailableLabel}</span>
      <strong>{trustedPresentationTitle(block)}</strong>
      <p>
        {reason === "invalid"
          ? copy.surfaceInvalidMessage
          : copy.surfaceUnknownMessage(block.kind, block.schemaVersion)}
      </p>
    </section>
  );
}

function renderSafeFallback(
  block: SurfaceBlock,
  reason: "unknown" | "invalid",
  fallback: SurfaceHostProps["fallback"],
  copy: AgentChatCopy,
  theme: AgentChatTheme | undefined,
) {
  return <>{fallback?.(block, reason) ?? <SafeSurfaceFallback block={block} reason={reason} copy={copy} theme={theme} />}</>;
}

export function SurfaceHost({ block, registry, onAction, fallback, copy, theme }: SurfaceHostProps) {
  const resolved = resolveAgentChatCopy(copy);
  let decoded: DecodedReactSurface | undefined;
  try {
    decoded = registry.decode(block);
  } catch {
    return renderSafeFallback(block, "invalid", fallback, resolved, theme);
  }

  if (!decoded) {
    return renderSafeFallback(block, "unknown", fallback, resolved, theme);
  }

  let a11yLabel: string;
  let heading: string;
  try {
    a11yLabel = decoded.plugin.getA11yLabel(decoded.block.payload);
    heading = decoded.block.presentation?.title ?? decoded.plugin.summarize(decoded.block.payload);
  } catch {
    return renderSafeFallback(block, "invalid", fallback, resolved, theme);
  }

  const Renderer = decoded.plugin.component;
  const invalidFallback = renderSafeFallback(block, "invalid", fallback, resolved, theme);
  return (
    <section className="sac-surface sac-theme" aria-label={a11yLabel} {...sacThemeAttributes(theme)}>
      <div className="sac-surface-heading">
        <div>
          <span className="sac-eyebrow">{resolved.surfaceKindLabel(decoded.block.kind)}</span>
          <strong>{heading}</strong>
        </div>
        <span className={`sac-status sac-status-${decoded.block.status}`}>
          {resolved.surfaceStatusLabel(decoded.block.status)}
        </span>
      </div>
      <SurfaceErrorBoundary key={`${block.id}:${block.revision}`} fallback={invalidFallback}>
        <Renderer
          block={decoded.block}
          {...(onAction
            ? { onAction: (action, input) => onAction(decoded.block, action, input) }
            : {})}
        />
      </SurfaceErrorBoundary>
    </section>
  );
}
