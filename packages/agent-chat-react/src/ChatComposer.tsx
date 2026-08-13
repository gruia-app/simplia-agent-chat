"use client";

import { useCallback, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

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

export function ChatComposer({
  onSubmit,
  ariaLabel,
  placeholder = "Describe the next action…",
  disabled = false,
  busy = false,
  submitLabel = "Send",
  hint = "Enter to send · Shift+Enter for a new line",
  initialValue = "",
}: ChatComposerProps) {
  const [value, setValue] = useState(initialValue);
  const inputId = useId();
  const composingRef = useRef(false);
  const canSubmit = !disabled && !busy && value.trim().length > 0;

  const submit = useCallback(() => {
    const next = value.trim();
    if (!next || disabled || busy) return;
    setValue("");
    void onSubmit(next);
  }, [busy, disabled, onSubmit, value]);

  const onFormSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
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
    <form className="sac-composer" onSubmit={onFormSubmit}>
      <label className="sac-sr-only" htmlFor={inputId}>
        {ariaLabel}
      </label>
      <textarea
        id={inputId}
        className="sac-composer-input"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={onKeyDown}
        onCompositionStart={() => {
          composingRef.current = true;
        }}
        onCompositionEnd={() => {
          composingRef.current = false;
        }}
        aria-label={ariaLabel}
        placeholder={placeholder}
        disabled={disabled}
        rows={2}
      />
      <div className="sac-composer-footer">
        <span className="sac-composer-hint">{hint}</span>
        <button className="sac-button sac-button-primary" type="submit" disabled={!canSubmit}>
          {busy ? "Working…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
