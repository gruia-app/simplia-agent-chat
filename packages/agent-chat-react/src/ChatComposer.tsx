"use client";

import {
  useCallback,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  resolveAgentChatCopy,
  sacThemeAttributes,
  type AgentChatCopyOverrides,
  type AgentChatTheme,
} from "./copy.js";

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
  copy?: AgentChatCopyOverrides | undefined;
  theme?: AgentChatTheme | undefined;
}

export function ChatComposer({
  onSubmit,
  ariaLabel,
  placeholder,
  disabled = false,
  busy = false,
  submitLabel,
  hint,
  initialValue = "",
  actions,
  onDraftChange,
  copy,
  theme,
}: ChatComposerProps) {
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
  const actionsRef = useRef<HTMLDivElement>(null);
  const occupied = busy || submitting;
  const canSubmit = !disabled && !occupied && value.trim().length > 0;

  const updateDraft = useCallback((next: string) => {
    valueRef.current = next;
    setValue(next);
    onDraftChange?.(next);
  }, [onDraftChange]);

  const submit = useCallback(() => {
    const snapshot = valueRef.current.trim();
    if (!snapshot || disabled || busy || submittingRef.current) return;
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
        if (valueRef.current === "") updateDraft(snapshot);
      });
  }, [busy, disabled, onSubmit, updateDraft]);

  const onFormSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    if (submitter && actionsRef.current?.contains(submitter)) return;
    submit();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    const nativeEvent = event.nativeEvent as globalThis.KeyboardEvent;
    if (
      event.key !== "Enter" ||
      event.shiftKey ||
      event.isDefaultPrevented() ||
      composingRef.current ||
      nativeEvent.isComposing ||
      nativeEvent.keyCode === 229
    ) {
      return;
    }
    event.preventDefault();
    submit();
  };

  return (
    <form
      className="sac-composer sac-theme"
      onSubmit={onFormSubmit}
      {...(occupied ? { "aria-busy": true } : {})}
      {...sacThemeAttributes(theme)}
    >
      <label className="sac-sr-only" htmlFor={inputId}>
        {ariaLabel}
      </label>
      <textarea
        id={inputId}
        className="sac-composer-input"
        value={value}
        onChange={(event) => updateDraft(event.target.value)}
        onKeyDown={onKeyDown}
        onCompositionStart={() => {
          composingRef.current = true;
        }}
        onCompositionEnd={() => {
          composingRef.current = false;
        }}
        aria-label={ariaLabel}
        placeholder={placeholderText}
        disabled={disabled}
        rows={2}
      />
      <div className="sac-composer-footer">
        <span className="sac-composer-hint">{hintText}</span>
        {actions !== undefined ? (
          <div
            className="sac-composer-actions"
            ref={actionsRef}
            onClick={(event) => {
              const target = event.target as { closest?: (selector: string) => { tagName: string; getAttribute: (name: string) => string | null } | null } | null;
              const control = typeof target?.closest === "function" ? target.closest("button, input[type=submit]") : null;
              if (!control) return;
              const type = control.getAttribute("type");
              if (control.tagName === "BUTTON" && (type === null || type === "submit")) {
                event.preventDefault();
              }
              if (control.tagName === "INPUT") event.preventDefault();
            }}
          >
            {actions}
          </div>
        ) : null}
        <button className="sac-button sac-button-primary" type="submit" disabled={!canSubmit}>
          {occupied ? resolved.composerBusyLabel : submitText}
        </button>
      </div>
    </form>
  );
}
