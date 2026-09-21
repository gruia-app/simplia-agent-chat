import type { ChatLimitNotice } from "simplia-agent-chat/core";
import { type AgentChatTheme } from "./copy.js";
export interface LimitNoticeBarProps {
    notice: ChatLimitNotice;
    /** Host action for the notice CTA (e.g. open billing). */
    onAction?: ((notice: ChatLimitNotice) => void) | undefined;
    ariaLabel: string;
    theme?: AgentChatTheme | undefined;
}
/**
 * Limit-reached notice rendered at the exact point of the limit — above the
 * composer. `role="alert"` announces it; the optional CTA is a plain button so
 * the host decides where the upgrade/settings flow lives.
 */
export declare function LimitNoticeBar({ notice, onAction, ariaLabel, theme }: LimitNoticeBarProps): import("react").JSX.Element;
//# sourceMappingURL=LimitNotice.d.ts.map