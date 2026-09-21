"use client";

import type { ChatLimitNotice } from "simplia-agent-chat/core";
import { sacThemeAttributes, type AgentChatTheme } from "./copy.js";

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
export function LimitNoticeBar({ notice, onAction, ariaLabel, theme }: LimitNoticeBarProps) {
  return (
    <div
      className="sac-limit-notice sac-theme"
      role="alert"
      aria-label={ariaLabel}
      data-limit-kind={notice.kind}
      {...sacThemeAttributes(theme)}
    >
      <p className="sac-limit-notice-message">{notice.message}</p>
      {notice.actionLabel ? (
        <button
          type="button"
          className="sac-button sac-limit-notice-action"
          onClick={() => onAction?.(notice)}
          {...(notice.actionId !== undefined ? { "data-action-id": notice.actionId } : {})}
        >
          {notice.actionLabel}
        </button>
      ) : null}
    </div>
  );
}
