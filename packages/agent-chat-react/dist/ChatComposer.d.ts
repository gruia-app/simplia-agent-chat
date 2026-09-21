import { type ReactNode } from "react";
import { type AgentChatCopyOverrides, type AgentChatTheme } from "./copy.js";
export interface ChatComposerDraft {
    value: string;
    /** Bumped by the host to adopt `value`; equal revisions are ignored. */
    revision: number;
}
export interface ChatComposerProps {
    onSubmit: (value: string) => void | Promise<void>;
    ariaLabel: string;
    placeholder?: string | undefined;
    disabled?: boolean | undefined;
    busy?: boolean | undefined;
    submitLabel?: string | undefined;
    hint?: string | undefined;
    initialValue?: string | undefined;
    actions?: ReactNode | undefined;
    onDraftChange?: ((value: string) => void) | undefined;
    /** External draft injection (suggestions, voice transcripts). */
    draft?: ChatComposerDraft | undefined;
    copy?: AgentChatCopyOverrides | undefined;
    theme?: AgentChatTheme | undefined;
}
export declare function ChatComposer({ onSubmit, ariaLabel, placeholder, disabled, busy, submitLabel, hint, initialValue, actions, onDraftChange, draft, copy, theme, }: ChatComposerProps): import("react").JSX.Element;
//# sourceMappingURL=ChatComposer.d.ts.map