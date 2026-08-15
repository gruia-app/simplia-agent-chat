"use client";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useId, useRef, useState } from "react";
export function ChatComposer({ onSubmit, ariaLabel, placeholder = "Describe the next action…", disabled = false, busy = false, submitLabel = "Send", hint = "Enter to send · Shift+Enter for a new line", initialValue = "", }) {
    const [value, setValue] = useState(initialValue);
    const inputId = useId();
    const composingRef = useRef(false);
    const canSubmit = !disabled && !busy && value.trim().length > 0;
    const submit = useCallback(() => {
        const next = value.trim();
        if (!next || disabled || busy)
            return;
        setValue("");
        void onSubmit(next);
    }, [busy, disabled, onSubmit, value]);
    const onFormSubmit = (event) => {
        event.preventDefault();
        submit();
    };
    const onKeyDown = (event) => {
        const nativeEvent = event.nativeEvent;
        if (event.key !== "Enter" ||
            event.shiftKey ||
            event.isDefaultPrevented() ||
            composingRef.current ||
            nativeEvent.isComposing ||
            nativeEvent.keyCode === 229) {
            return;
        }
        event.preventDefault();
        submit();
    };
    return (_jsxs("form", { className: "sac-composer", onSubmit: onFormSubmit, children: [_jsx("label", { className: "sac-sr-only", htmlFor: inputId, children: ariaLabel }), _jsx("textarea", { id: inputId, className: "sac-composer-input", value: value, onChange: (event) => setValue(event.target.value), onKeyDown: onKeyDown, onCompositionStart: () => {
                    composingRef.current = true;
                }, onCompositionEnd: () => {
                    composingRef.current = false;
                }, "aria-label": ariaLabel, placeholder: placeholder, disabled: disabled, rows: 2 }), _jsxs("div", { className: "sac-composer-footer", children: [_jsx("span", { className: "sac-composer-hint", children: hint }), _jsx("button", { className: "sac-button sac-button-primary", type: "submit", disabled: !canSubmit, children: busy ? "Working…" : submitLabel })] })] }));
}
//# sourceMappingURL=ChatComposer.js.map