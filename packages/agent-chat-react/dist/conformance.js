import { AGENT_CHAT_WORKSPACE_PANE_IDS } from "./AgentChatWorkspace.js";
const DETAIL = Object.freeze({
    regionPresent: "workspace region landmark is present",
    regionMissing: "workspace region landmark is missing",
    layoutPresent: "workspace layout attribute matches the expected layout",
    layoutMissing: "workspace layout attribute does not match the expected layout",
    historyLabelPresent: "history landmark label is present",
    historyLabelMissing: "history landmark label is missing",
    queueLabelPresent: "work queue landmark label is present",
    queueLabelMissing: "work queue landmark label is missing",
    workbenchLabelPresent: "workbench landmark label is present",
    workbenchLabelMissing: "workbench landmark label is missing",
    paneOrder: "visible panes appear in the documented DOM order",
    paneOrderBroken: "visible panes are missing or out of documented DOM order",
    hiddenAbsent: "hidden panes are absent from markup",
    hiddenPresent: "hidden panes are present in markup",
    noLibraryButtons: "text-only workspace markup has no library navigation buttons",
    libraryButtons: "text-only workspace markup includes library navigation buttons",
    nestedShellPresent: "nested conversation shell marker is present",
    nestedShellMissing: "nested conversation shell marker is missing",
    canaryIsolated: "markup did not leak the payload canary",
    canaryLeaked: "markup leaked the payload canary",
    surfaceFallback: "surface host fallback markup is present",
    surfaceReady: "surface host trusted markup is present",
    surfaceMissing: "surface host markup is missing",
    surfaceKindPresent: "surface kind label is present",
    surfaceKindMissing: "surface kind label is missing",
});
function freezeReport(checks) {
    const frozenChecks = Object.freeze(checks.map((entry) => Object.freeze({ ...entry })));
    return Object.freeze({
        ok: frozenChecks.every((entry) => entry.passed || entry.severity === "warning"),
        checks: frozenChecks,
    });
}
function check(id, description, passed, passDetail, failDetail, severity = "error") {
    return {
        id,
        description,
        passed,
        severity,
        detail: passed ? passDetail : failDetail,
    };
}
function escapeHtml(value, attribute) {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(attribute ? /"/g : /$^/g, "&quot;")
        .replace(attribute ? /'/g : /$^/g, "&#x27;");
}
function attributeValue(openingTag, name) {
    if (!openingTag)
        return undefined;
    for (const match of openingTag.matchAll(/([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
        if (match[1]?.toLowerCase() === name.toLowerCase())
            return match[2] ?? match[3] ?? "";
    }
    return undefined;
}
function hasAttribute(openingTag, name, value) {
    return attributeValue(openingTag, name) === escapeHtml(value, true);
}
function paneIndex(html, id) {
    const tag = paneOpeningTag(html, id);
    return tag ? html.indexOf(tag) : -1;
}
function openingTagWithAttribute(html, name, value) {
    const escaped = escapeHtml(value, true);
    for (const match of html.matchAll(/<[^>]+>/g)) {
        if (attributeValue(match[0], name) === escaped)
            return match[0];
    }
    return undefined;
}
function workspaceOpeningTag(html) {
    return openingTagWithAttribute(html, "data-sac-workspace", "");
}
function paneOpeningTag(html, id) {
    return openingTagWithAttribute(html, "data-sac-pane", id);
}
function hasClassToken(openingTag, token) {
    const classes = attributeValue(openingTag, "class");
    return classes?.split(/\s+/).includes(token) ?? false;
}
function openingTagWithClass(html, token) {
    for (const match of html.matchAll(/<[^>]+>/g)) {
        if (hasClassToken(match[0], token))
            return match[0];
    }
    return undefined;
}
function elementSegment(html, openingTag) {
    if (!openingTag)
        return undefined;
    const start = html.indexOf(openingTag);
    const tagName = openingTag.match(/^<([a-z][\w-]*)\b/i)?.[1];
    if (start < 0 || !tagName)
        return undefined;
    const matcher = new RegExp(`<\\/?${tagName}\\b[^>]*>`, "gi");
    let depth = 0;
    for (const match of html.slice(start).matchAll(matcher)) {
        const tag = match[0];
        if (tag.startsWith("</"))
            depth -= 1;
        else if (!tag.endsWith("/>"))
            depth += 1;
        if (depth === 0)
            return html.slice(start, start + (match.index ?? 0) + tag.length);
    }
    return openingTag;
}
function paneSegment(html, id) {
    return elementSegment(html, paneOpeningTag(html, id));
}
function leaksCanary(html, canary) {
    if (!canary.trim())
        return true;
    const variants = new Set([
        canary,
        escapeHtml(canary, false),
        escapeHtml(canary, true),
    ]);
    return [...variants].some((variant) => variant.length > 0 && html.includes(variant));
}
const PANE_ORDER = [
    AGENT_CHAT_WORKSPACE_PANE_IDS.history,
    AGENT_CHAT_WORKSPACE_PANE_IDS.conversation,
    AGENT_CHAT_WORKSPACE_PANE_IDS.workQueue,
    AGENT_CHAT_WORKSPACE_PANE_IDS.workbench,
];
export function runWorkspaceMarkupConformance(input) {
    const html = input.html;
    const expected = input.expected;
    const checks = [];
    const rootTag = workspaceOpeningTag(html);
    const normalizedVisiblePanes = PANE_ORDER.filter((id) => expected.visiblePanes.includes(id));
    checks.push(check("workspace.region", "Workspace root exposes a labeled region landmark", expected.ariaLabel.trim().length > 0
        && hasAttribute(rootTag, "role", "region")
        && hasAttribute(rootTag, "aria-label", expected.ariaLabel), DETAIL.regionPresent, DETAIL.regionMissing));
    checks.push(check("workspace.layout", "Workspace layout attribute matches home or work presence", hasAttribute(rootTag, "data-sac-workspace-layout", expected.layout), DETAIL.layoutPresent, DETAIL.layoutMissing));
    checks.push(check("workspace.history-label", "History pane keeps the application-provided landmark label", normalizedVisiblePanes.includes(AGENT_CHAT_WORKSPACE_PANE_IDS.history)
        ? expected.historyLabel.trim().length > 0
            && hasAttribute(paneOpeningTag(html, AGENT_CHAT_WORKSPACE_PANE_IDS.history), "aria-label", expected.historyLabel)
        : true, DETAIL.historyLabelPresent, DETAIL.historyLabelMissing));
    if (normalizedVisiblePanes.includes(AGENT_CHAT_WORKSPACE_PANE_IDS.workQueue)) {
        checks.push(check("workspace.queue-label", "Work queue pane keeps the application-provided landmark label", typeof expected.workQueueLabel === "string"
            && expected.workQueueLabel.trim().length > 0
            && hasAttribute(paneOpeningTag(html, AGENT_CHAT_WORKSPACE_PANE_IDS.workQueue), "aria-label", expected.workQueueLabel), DETAIL.queueLabelPresent, DETAIL.queueLabelMissing));
    }
    if (normalizedVisiblePanes.includes(AGENT_CHAT_WORKSPACE_PANE_IDS.workbench)) {
        checks.push(check("workspace.workbench-label", "Workbench pane keeps the application-provided landmark label", typeof expected.workbenchLabel === "string"
            && expected.workbenchLabel.trim().length > 0
            && hasAttribute(paneOpeningTag(html, AGENT_CHAT_WORKSPACE_PANE_IDS.workbench), "aria-label", expected.workbenchLabel), DETAIL.workbenchLabelPresent, DETAIL.workbenchLabelMissing));
    }
    const visibleIndexes = normalizedVisiblePanes.map((id) => paneIndex(html, id));
    const orderPassed = visibleIndexes.every((index) => index >= 0)
        && visibleIndexes.every((index, offset, all) => offset === 0 || index > (all[offset - 1] ?? -1));
    checks.push(check("workspace.pane-order", "Visible panes stay in documented DOM order", orderPassed, DETAIL.paneOrder, DETAIL.paneOrderBroken));
    const hiddenPanes = PANE_ORDER.filter((id) => !normalizedVisiblePanes.includes(id));
    checks.push(check("workspace.hidden-panes", "Hidden or omitted panes are unmounted", hiddenPanes.every((id) => paneIndex(html, id) === -1), DETAIL.hiddenAbsent, DETAIL.hiddenPresent));
    if (expected.textOnly) {
        checks.push(check("workspace.no-library-nav", "Text-only workspace fixtures do not invent navigation buttons", !/<button\b/i.test(html), DETAIL.noLibraryButtons, DETAIL.libraryButtons));
    }
    if (expected.nestedShell) {
        checks.push(check("workspace.nested-shell", "Conversation pane includes the nested shell marker", hasClassToken(openingTagWithClass(paneSegment(html, AGENT_CHAT_WORKSPACE_PANE_IDS.conversation) ?? "", "sac-shell"), "sac-shell"), DETAIL.nestedShellPresent, DETAIL.nestedShellMissing));
    }
    const canary = expected.canary;
    if (canary) {
        checks.push(check("workspace.canary-isolation", "Workspace markup does not leak the payload canary", !leaksCanary(html, canary), DETAIL.canaryIsolated, DETAIL.canaryLeaked));
    }
    return freezeReport(checks);
}
export function runSurfaceHostMarkupConformance(input) {
    const html = input.html;
    const expected = input.expected;
    const checks = [];
    const fallbackTag = openingTagWithClass(html, "sac-surface-fallback");
    const trustedTag = openingTagWithClass(html, "sac-surface");
    const fallback = hasClassToken(fallbackTag, "sac-surface-fallback");
    const trusted = hasClassToken(trustedTag, "sac-surface");
    const surfaceHtml = elementSegment(html, expected.fallback ? fallbackTag : trustedTag ?? fallbackTag) ?? "";
    checks.push(check("surface-host.markup", "Surface host renders trusted or fail-closed fallback markup", expected.fallback ? fallback : trusted || fallback, expected.fallback ? DETAIL.surfaceFallback : DETAIL.surfaceReady, DETAIL.surfaceMissing));
    if (expected.kind) {
        checks.push(check("surface-host.kind", "Surface host markup includes the escaped surface kind", expected.kind.trim().length > 0
            && (surfaceHtml.includes(escapeHtml(expected.kind, false))
                || surfaceHtml.includes(escapeHtml(expected.kind, true))), DETAIL.surfaceKindPresent, DETAIL.surfaceKindMissing));
    }
    const canary = expected.canary;
    if (canary) {
        checks.push(check("surface-host.canary-isolation", "Surface host markup does not leak the payload canary", !leaksCanary(html, canary), DETAIL.canaryIsolated, DETAIL.canaryLeaked));
    }
    return freezeReport(checks);
}
//# sourceMappingURL=conformance.js.map