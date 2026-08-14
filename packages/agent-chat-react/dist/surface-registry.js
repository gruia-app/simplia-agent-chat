"use client";
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Component } from "react";
import { SurfaceRegistry, unknownSurfaceSummary, } from "simplia-agent-chat/core";
class SurfaceErrorBoundary extends Component {
    state = { failed: false };
    static getDerivedStateFromError() {
        return { failed: true };
    }
    render() {
        return this.state.failed ? this.props.fallback : this.props.children;
    }
}
export class ReactSurfaceRegistry {
    #core = new SurfaceRegistry();
    #plugins = new Map();
    register(plugin) {
        const unregisterCore = this.#core.register(plugin);
        const registered = plugin;
        this.#plugins.set(plugin.kind, registered);
        return () => {
            unregisterCore();
            if (this.#plugins.get(plugin.kind) === registered)
                this.#plugins.delete(plugin.kind);
        };
    }
    decode(block) {
        const decoded = this.#core.decode(block);
        if (!decoded)
            return undefined;
        const plugin = this.#plugins.get(block.kind);
        return plugin ? { block: decoded.block, plugin } : undefined;
    }
    kinds() {
        return this.#core.kinds();
    }
}
function trustedPresentationTitle(block) {
    return block.presentation?.title?.trim() || block.kind;
}
function SafeSurfaceFallback({ block, reason }) {
    return (_jsxs("section", { className: "sac-surface-fallback", "aria-label": unknownSurfaceSummary(block), children: [_jsx("span", { className: "sac-eyebrow", children: "SURFACE_UNAVAILABLE" }), _jsx("strong", { children: trustedPresentationTitle(block) }), _jsx("p", { children: reason === "invalid"
                    ? "This surface payload did not pass its local schema."
                    : `No trusted renderer is registered for ${block.kind} v${block.schemaVersion}.` })] }));
}
function renderSafeFallback(block, reason, fallback) {
    return _jsx(_Fragment, { children: fallback?.(block, reason) ?? _jsx(SafeSurfaceFallback, { block: block, reason: reason }) });
}
export function SurfaceHost({ block, registry, onAction, fallback }) {
    let decoded;
    try {
        decoded = registry.decode(block);
    }
    catch {
        return renderSafeFallback(block, "invalid", fallback);
    }
    if (!decoded) {
        return renderSafeFallback(block, "unknown", fallback);
    }
    let a11yLabel;
    let heading;
    try {
        a11yLabel = decoded.plugin.getA11yLabel(decoded.block.payload);
        heading = decoded.block.presentation?.title ?? decoded.plugin.summarize(decoded.block.payload);
    }
    catch {
        return renderSafeFallback(block, "invalid", fallback);
    }
    const Renderer = decoded.plugin.component;
    const invalidFallback = renderSafeFallback(block, "invalid", fallback);
    return (_jsxs("section", { className: "sac-surface", "aria-label": a11yLabel, children: [_jsxs("div", { className: "sac-surface-heading", children: [_jsxs("div", { children: [_jsx("span", { className: "sac-eyebrow", children: decoded.block.kind }), _jsx("strong", { children: heading })] }), _jsx("span", { className: `sac-status sac-status-${decoded.block.status}`, children: decoded.block.status })] }), _jsx(SurfaceErrorBoundary, { fallback: invalidFallback, children: _jsx(Renderer, { block: decoded.block, ...(onAction
                        ? { onAction: (action, input) => onAction(decoded.block, action, input) }
                        : {}) }) }, `${block.id}:${block.revision}`)] }));
}
//# sourceMappingURL=surface-registry.js.map