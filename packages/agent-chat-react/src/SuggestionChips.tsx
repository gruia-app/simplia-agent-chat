"use client";

import { useCallback, useRef, useState, type KeyboardEvent } from "react";
import type { ChatSuggestion } from "simplia-agent-chat/core";
import { sacThemeAttributes, type AgentChatTheme } from "./copy.js";

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
export function SuggestionChips({ suggestions, onSelect, ariaLabel, theme }: SuggestionChipsProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const buttonsRef = useRef<(HTMLButtonElement | null)[]>([]);

  const focusChip = useCallback((index: number) => {
    setActiveIndex(index);
    buttonsRef.current[index]?.focus();
  }, []);

  const onKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    const count = suggestions.length;
    if (count === 0) return;
    let next: number | undefined;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      next = (activeIndex + 1) % count;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      next = (activeIndex - 1 + count) % count;
    } else if (event.key === "Home") {
      next = 0;
    } else if (event.key === "End") {
      next = count - 1;
    }
    if (next === undefined) return;
    event.preventDefault();
    focusChip(next);
  }, [activeIndex, focusChip, suggestions.length]);

  if (suggestions.length === 0) return null;

  return (
    <div
      className="sac-suggestions sac-theme"
      role="group"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      {...sacThemeAttributes(theme)}
    >
      {suggestions.map((suggestion, index) => (
        <button
          key={suggestion.id}
          ref={(node) => {
            buttonsRef.current[index] = node;
          }}
          type="button"
          className="sac-suggestion-chip"
          tabIndex={index === activeIndex ? 0 : -1}
          onFocus={() => setActiveIndex(index)}
          onClick={() => onSelect(suggestion)}
          {...(suggestion.description !== undefined ? { title: suggestion.description } : {})}
          aria-label={suggestion.description ?? suggestion.label}
        >
          {suggestion.label}
        </button>
      ))}
    </div>
  );
}
