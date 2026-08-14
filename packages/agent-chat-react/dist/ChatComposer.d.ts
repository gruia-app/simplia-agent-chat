export interface ChatComposerProps {
    onSubmit: (value: string) => void | Promise<void>;
    ariaLabel: string;
    placeholder?: string | undefined;
    disabled?: boolean | undefined;
    busy?: boolean | undefined;
    submitLabel?: string | undefined;
    hint?: string | undefined;
    initialValue?: string | undefined;
}
export declare function ChatComposer({ onSubmit, ariaLabel, placeholder, disabled, busy, submitLabel, hint, initialValue, }: ChatComposerProps): import("react").JSX.Element;
//# sourceMappingURL=ChatComposer.d.ts.map