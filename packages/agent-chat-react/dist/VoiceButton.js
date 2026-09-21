"use client";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback } from "react";
import { resolveAgentChatCopy, sacThemeAttributes, } from "./copy.js";
function MicGlyph() {
    return (_jsx("svg", { className: "sac-voice-glyph", viewBox: "0 0 16 16", width: "14", height: "14", "aria-hidden": "true", focusable: "false", children: _jsx("path", { fill: "currentColor", d: "M8 1.5a2.25 2.25 0 0 0-2.25 2.25v4a2.25 2.25 0 0 0 4.5 0v-4A2.25 2.25 0 0 0 8 1.5Zm-3.5 6a.75.75 0 0 1 .75.75 2.75 2.75 0 0 0 5.5 0 .75.75 0 0 1 1.5 0 4.25 4.25 0 0 1-3.5 4.19v1.31a.75.75 0 0 1-1.5 0v-1.31a4.25 4.25 0 0 1-3.5-4.19.75.75 0 0 1 .75-.75Z" }) }));
}
/**
 * Push-to-talk trigger for the composer action slot. Hold (pointer or
 * Space/Enter) to record, release to stop. The transcript stays editable in
 * the composer through `capture.transcript` / `onTranscript`; nothing is sent
 * until the operator submits.
 */
export function VoiceButton({ capture, ariaLabel, disabled = false, copy, theme }) {
    const resolved = resolveAgentChatCopy(copy);
    const recording = capture.status === "recording";
    const starting = capture.status === "starting";
    const errored = capture.status === "error";
    const unavailable = !capture.supported;
    const label = unavailable
        ? resolved.voiceUnsupportedLabel
        : errored
            ? resolved.voiceErrorLabel
            : starting
                ? resolved.voiceConnectingLabel
                : recording
                    ? resolved.voiceStopLabel
                    : resolved.voiceStartLabel;
    const press = useCallback(() => {
        if (disabled || unavailable)
            return;
        capture.start();
    }, [capture, disabled, unavailable]);
    const release = useCallback(() => {
        if (!recording && !starting)
            return;
        capture.stop();
    }, [capture, recording, starting]);
    const onPointerDown = (event) => {
        if (event.button !== 0)
            return;
        event.preventDefault();
        press();
    };
    const onKeyDown = (event) => {
        if (event.repeat)
            return;
        if (event.key !== " " && event.key !== "Enter")
            return;
        event.preventDefault();
        press();
    };
    const onKeyUp = (event) => {
        if (event.key !== " " && event.key !== "Enter")
            return;
        event.preventDefault();
        release();
    };
    return (_jsxs("button", { type: "button", className: "sac-button sac-voice-button", "data-sac-voice-status": capture.status, "aria-pressed": recording, "aria-label": ariaLabel ?? label, title: label, disabled: disabled || unavailable, onPointerDown: onPointerDown, onPointerUp: release, onPointerLeave: release, onPointerCancel: release, onKeyDown: onKeyDown, onKeyUp: onKeyUp, ...sacThemeAttributes(theme), children: [_jsx(MicGlyph, {}), _jsx("span", { className: "sac-sr-only", children: label })] }));
}
//# sourceMappingURL=VoiceButton.js.map