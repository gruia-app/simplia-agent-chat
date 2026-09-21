import { type VoiceTransport, type VoiceTransportErrorReason, type VoiceTranscriptFrame, type VoiceUsageMeter } from "simplia-agent-chat/core";
export interface VoiceAudioSourceHandlers {
    onChunk: (chunk: Blob) => void;
    onError?: ((error: unknown) => void) | undefined;
}
/**
 * Encoded-audio producer. `stop` resolves after the source flushed its last
 * chunk so no tail audio is lost before the transport closes.
 */
export interface VoiceAudioSource {
    start(): void | Promise<void>;
    stop(): void | Promise<void>;
}
export type VoiceAudioSourceFactory = (handlers: VoiceAudioSourceHandlers) => VoiceAudioSource | Promise<VoiceAudioSource>;
export type VoiceCaptureStatus = "idle" | "starting" | "recording" | "error";
export interface UseVoiceCaptureOptions {
    transport: VoiceTransport;
    meter?: VoiceUsageMeter | undefined;
    model?: string | undefined;
    language?: string | undefined;
    tenantId?: string | undefined;
    organizationId?: string | undefined;
    onTranscript?: ((frame: VoiceTranscriptFrame) => void) | undefined;
    onError?: ((reason: VoiceTransportErrorReason | "capture_failed" | "unsupported", error?: unknown) => void) | undefined;
    /** Injectable for tests; defaults to `createMediaRecorderSource()`. */
    createSource?: VoiceAudioSourceFactory | undefined;
    /** Capability override for tests/SSR. */
    supported?: boolean | undefined;
}
export interface VoiceCapture {
    status: VoiceCaptureStatus;
    supported: boolean;
    /** Concatenated final transcripts for the current/last capture. */
    transcript: string;
    /** Latest non-final transcript frame while recording. */
    interim: string;
    start: () => void;
    stop: () => void;
}
export declare function isVoiceCaptureSupported(): boolean;
export interface MediaRecorderSourceOptions {
    mimeType?: string;
    timesliceMs?: number;
    audioConstraints?: MediaTrackConstraints | boolean;
}
/**
 * Default capture source: `getUserMedia` plus `MediaRecorder` emitting
 * encoded chunks on a 250 ms timeslice. Stopping flushes the buffered tail
 * before releasing the microphone tracks.
 */
export declare function createMediaRecorderSource(options?: MediaRecorderSourceOptions): VoiceAudioSourceFactory;
/**
 * Push-to-talk orchestration for the composer: owns the voice session, the
 * audio source lifecycle and the live transcript the host can stage into the
 * draft before sending. Never touches provider credentials itself.
 */
export declare function useVoiceCapture(options: UseVoiceCaptureOptions): VoiceCapture;
//# sourceMappingURL=use-voice-capture.d.ts.map