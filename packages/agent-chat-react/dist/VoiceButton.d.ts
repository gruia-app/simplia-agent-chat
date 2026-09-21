import { type AgentChatCopyOverrides, type AgentChatTheme } from "./copy.js";
import type { VoiceCapture } from "./use-voice-capture.js";
export interface VoiceButtonProps {
    capture: VoiceCapture;
    ariaLabel?: string | undefined;
    disabled?: boolean | undefined;
    copy?: AgentChatCopyOverrides | undefined;
    theme?: AgentChatTheme | undefined;
}
/**
 * Push-to-talk trigger for the composer action slot. Hold (pointer or
 * Space/Enter) to record, release to stop. The transcript stays editable in
 * the composer through `capture.transcript` / `onTranscript`; nothing is sent
 * until the operator submits.
 */
export declare function VoiceButton({ capture, ariaLabel, disabled, copy, theme }: VoiceButtonProps): import("react").JSX.Element;
//# sourceMappingURL=VoiceButton.d.ts.map