"use client";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useId, useRef, useState, } from "react";
import { resolveAgentChatCopy, sacThemeAttributes, } from "./copy.js";
export function ChatComposer({ onSubmit, ariaLabel, placeholder, disabled = false, busy = false, submitLabel, hint, initialValue = "", actions, onDraftChange, copy, theme, }) {
    const resolved = resolveAgentChatCopy(copy);
    const placeholderText = placeholder ?? resolved.composerPlaceholder;
    const submitText = submitLabel ?? resolved.composerSubmitLabel;
    const hintText = hint ?? resolved.composerHint;
    const [value, setValue] = useState(initialValue);
    const [submitting, setSubmitting] = useState(false);
    const inputId = useId();
    const composingRef = useRef(false);
    const submittingRef = useRef(false);
    const valueRef = useRef(initialValue);
    const actionsRef = useRef(null);
    const occupied = busy || submitting;
    const canSubmit = !disabled && !occupied && value.trim().length > 0;
    const updateDraft = useCallback((next) => {
        valueRef.current = next;
        setValue(next);
        onDraftChange?.(next);
    }, [onDraftChange]);
    const submit = useCallback(() => {
        const snapshot = valueRef.current.trim();
        if (!snapshot || disabled || busy || submittingRef.current)
            return;
        submittingRef.current = true;
        setSubmitting(true);
        updateDraft("");
        void Promise.resolve()
            .then(() => onSubmit(snapshot))
            .then(() => {
            submittingRef.current = false;
            setSubmitting(false);
        })
            .catch(() => {
            submittingRef.current = false;
            setSubmitting(false);
            if (valueRef.current === "")
                updateDraft(snapshot);
        });
    }, [busy, disabled, onSubmit, updateDraft]);
    const onFormSubmit = (event) => {
        event.preventDefault();
        const submitter = event.nativeEvent.submitter;
        if (submitter && actionsRef.current?.contains(submitter))
            return;
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
    return (_jsxs("form", { className: "sac-composer sac-theme", onSubmit: onFormSubmit, ...(occupied ? { "aria-busy": true } : {}), ...sacThemeAttributes(theme), children: [_jsx("label", { className: "sac-sr-only", htmlFor: inputId, children: ariaLabel }), _jsx("textarea", { id: inputId, className: "sac-composer-input", value: value, onChange: (event) => updateDraft(event.target.value), onKeyDown: onKeyDown, onCompositionStart: () => {
                    composingRef.current = true;
                }, onCompositionEnd: () => {
                    composingRef.current = false;
                }, "aria-label": ariaLabel, placeholder: placeholderText, disabled: disabled, rows: 2 }), _jsxs("div", { className: "sac-composer-footer", children: [_jsx("span", { className: "sac-composer-hint", children: hintText }), actions !== undefined ? (_jsx("div", { className: "sac-composer-actions", ref: actionsRef, onClick: (event) => {
                            const target = event.target;
                            const control = typeof target?.closest === "function" ? target.closest("button, input[type=submit]") : null;
                            if (!control)
                                return;
                            const type = control.getAttribute("type");
                            if (control.tagName === "BUTTON" && (type === null || type === "submit")) {
                                event.preventDefault();
                            }
                            if (control.tagName === "INPUT")
                                event.preventDefault();
                        }, children: actions })) : null, _jsx("button", { className: "sac-button sac-button-primary", type: "submit", disabled: !canSubmit, children: occupied ? resolved.composerBusyLabel : submitText })] })] }));
}
//# sourceMappingURL=ChatComposer.js.map