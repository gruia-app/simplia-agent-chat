"use client";
import { jsx as _jsx } from "react/jsx-runtime";
import { useCallback, useRef, useState } from "react";
import { sacThemeAttributes } from "./copy.js";
/**
 * Row of suggestion chips rendered above the composer. Roving tabindex with
 * Arrow/Home/End navigation keeps the whole row a single Tab stop.
 */
export function SuggestionChips({ suggestions, onSelect, ariaLabel, theme }) {
    const [activeIndex, setActiveIndex] = useState(0);
    const buttonsRef = useRef([]);
    const focusChip = useCallback((index) => {
        setActiveIndex(index);
        buttonsRef.current[index]?.focus();
    }, []);
    const onKeyDown = useCallback((event) => {
        const count = suggestions.length;
        if (count === 0)
            return;
        let next;
        if (event.key === "ArrowRight" || event.key === "ArrowDown") {
            next = (activeIndex + 1) % count;
        }
        else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
            next = (activeIndex - 1 + count) % count;
        }
        else if (event.key === "Home") {
            next = 0;
        }
        else if (event.key === "End") {
            next = count - 1;
        }
        if (next === undefined)
            return;
        event.preventDefault();
        focusChip(next);
    }, [activeIndex, focusChip, suggestions.length]);
    if (suggestions.length === 0)
        return null;
    return (_jsx("div", { className: "sac-suggestions sac-theme", role: "group", "aria-label": ariaLabel, onKeyDown: onKeyDown, ...sacThemeAttributes(theme), children: suggestions.map((suggestion, index) => (_jsx("button", { ref: (node) => {
                buttonsRef.current[index] = node;
            }, type: "button", className: "sac-suggestion-chip", tabIndex: index === activeIndex ? 0 : -1, onFocus: () => setActiveIndex(index), onClick: () => onSelect(suggestion), ...(suggestion.description !== undefined ? { title: suggestion.description } : {}), "aria-label": suggestion.description ?? suggestion.label, children: suggestion.label }, suggestion.id))) }));
}
//# sourceMappingURL=SuggestionChips.js.map