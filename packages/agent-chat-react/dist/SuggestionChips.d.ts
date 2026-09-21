import type { ChatSuggestion } from "simplia-agent-chat/core";
import { type AgentChatTheme } from "./copy.js";
export interface SuggestionChipsProps {
    suggestions: readonly ChatSuggestion[];
    onSelect: (suggestion: ChatSuggestion) => void;
    ariaLabel: string;
    theme?: AgentChatTheme | undefined;
}
/**
 * Row of suggestion chips rendered above the composer. Roving tabindex with
 * Arrow/Home/End navigation keeps the whole row a single Tab stop.
 */
export declare function SuggestionChips({ suggestions, onSelect, ariaLabel, theme }: SuggestionChipsProps): import("react").JSX.Element | null;
//# sourceMappingURL=SuggestionChips.d.ts.map