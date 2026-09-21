"use client";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { sacThemeAttributes } from "./copy.js";
/**
 * Limit-reached notice rendered at the exact point of the limit — above the
 * composer. `role="alert"` announces it; the optional CTA is a plain button so
 * the host decides where the upgrade/settings flow lives.
 */
export function LimitNoticeBar({ notice, onAction, ariaLabel, theme }) {
    return (_jsxs("div", { className: "sac-limit-notice sac-theme", role: "alert", "aria-label": ariaLabel, "data-limit-kind": notice.kind, ...sacThemeAttributes(theme), children: [_jsx("p", { className: "sac-limit-notice-message", children: notice.message }), notice.actionLabel ? (_jsx("button", { type: "button", className: "sac-button sac-limit-notice-action", onClick: () => onAction?.(notice), ...(notice.actionId !== undefined ? { "data-action-id": notice.actionId } : {}), children: notice.actionLabel })) : null] }));
}
//# sourceMappingURL=LimitNotice.js.map