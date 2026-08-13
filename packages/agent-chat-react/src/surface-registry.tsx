"use client";

import { Component, type ComponentType, type ReactNode } from "react";
import {
  SurfaceRegistry,
  type JsonValue,
  type SurfaceActionRef,
  type SurfaceBlock,
  type SurfacePlugin,
  unknownSurfaceSummary,
} from "@simplia/agent-chat-core";

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
}

function SafeSurfaceFallback({ block, reason }: { block: SurfaceBlock; reason: "unknown" | "invalid" }) {
  return (
    <section className="sac-surface-fallback" aria-label={unknownSurfaceSummary(block)}>
      <span className="sac-eyebrow">SURFACE_UNAVAILABLE</span>
      <strong>{block.presentation?.title ?? block.kind}</strong>
      <p>
        {reason === "invalid"
          ? "This surface payload did not pass its local schema."
          : `No trusted renderer is registered for ${block.kind} v${block.schemaVersion}.`}
      </p>
    </section>
  );
}

export function SurfaceHost({ block, registry, onAction, fallback }: SurfaceHostProps) {
  let decoded: DecodedReactSurface | undefined;
  try {
    decoded = registry.decode(block);
  } catch {
    return <>{fallback?.(block, "invalid") ?? <SafeSurfaceFallback block={block} reason="invalid" />}</>;
  }

  if (!decoded) {
    return <>{fallback?.(block, "unknown") ?? <SafeSurfaceFallback block={block} reason="unknown" />}</>;
  }

  const Renderer = decoded.plugin.component;
  const invalidFallback = fallback?.(block, "invalid") ?? <SafeSurfaceFallback block={block} reason="invalid" />;
  return (
    <section className="sac-surface" aria-label={decoded.plugin.getA11yLabel(decoded.block.payload)}>
      <div className="sac-surface-heading">
        <div>
          <span className="sac-eyebrow">{decoded.block.kind}</span>
          <strong>{decoded.block.presentation?.title ?? decoded.plugin.summarize(decoded.block.payload)}</strong>
        </div>
        <span className={`sac-status sac-status-${decoded.block.status}`}>{decoded.block.status}</span>
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
