"use client";
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Component } from "react";
import { SurfaceRegistry, } from "simplia-agent-chat/core";
import { resolveAgentChatCopy, sacThemeAttributes, } from "./copy.js";
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
function SafeSurfaceFallback({ block, reason, copy, theme, }) {
    const title = block.presentation?.title?.trim() || undefined;
    return (_jsxs("section", { className: "sac-surface-fallback sac-theme", "aria-label": copy.surfaceFallbackAriaLabel(block.kind, block.schemaVersion, title), ...sacThemeAttributes(theme), children: [_jsx("span", { className: "sac-eyebrow", children: copy.surfaceUnavailableLabel }), _jsx("strong", { children: trustedPresentationTitle(block) }), _jsx("p", { children: reason === "invalid"
                    ? copy.surfaceInvalidMessage
                    : copy.surfaceUnknownMessage(block.kind, block.schemaVersion) })] }));
}
function renderSafeFallback(block, reason, fallback, copy, theme) {
    return _jsx(_Fragment, { children: fallback?.(block, reason) ?? _jsx(SafeSurfaceFallback, { block: block, reason: reason, copy: copy, theme: theme }) });
}
export function SurfaceHost({ block, registry, onAction, fallback, copy, theme }) {
    const resolved = resolveAgentChatCopy(copy);
    let decoded;
    try {
        decoded = registry.decode(block);
    }
    catch {
        return renderSafeFallback(block, "invalid", fallback, resolved, theme);
    }
    if (!decoded) {
        return renderSafeFallback(block, "unknown", fallback, resolved, theme);
    }
    let a11yLabel;
    let heading;
    try {
        a11yLabel = decoded.plugin.getA11yLabel(decoded.block.payload);
        heading = decoded.block.presentation?.title ?? decoded.plugin.summarize(decoded.block.payload);
    }
    catch {
        return renderSafeFallback(block, "invalid", fallback, resolved, theme);
    }
    const Renderer = decoded.plugin.component;
    const invalidFallback = renderSafeFallback(block, "invalid", fallback, resolved, theme);
    return (_jsxs("section", { className: "sac-surface sac-theme", "aria-label": a11yLabel, ...sacThemeAttributes(theme), children: [_jsxs("div", { className: "sac-surface-heading", children: [_jsxs("div", { children: [_jsx("span", { className: "sac-eyebrow", children: resolved.surfaceKindLabel(decoded.block.kind) }), _jsx("strong", { children: heading })] }), _jsx("span", { className: `sac-status sac-status-${decoded.block.status}`, children: resolved.surfaceStatusLabel(decoded.block.status) })] }), _jsx(SurfaceErrorBoundary, { fallback: invalidFallback, children: _jsx(Renderer, { block: decoded.block, ...(onAction
                        ? { onAction: (action, input) => onAction(decoded.block, action, input) }
                        : {}) }) }, `${block.id}:${block.revision}`)] }));
}
//# sourceMappingURL=surface-registry.js.map