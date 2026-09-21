"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createVoiceSession,
  type VoiceSession,
  type VoiceTransport,
  type VoiceTransportErrorReason,
  type VoiceTranscriptFrame,
  type VoiceUsageMeter,
} from "simplia-agent-chat/core";

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

export type VoiceAudioSourceFactory = (
  handlers: VoiceAudioSourceHandlers,
) => VoiceAudioSource | Promise<VoiceAudioSource>;

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

const DEFAULT_TIMESLICE_MS = 250;
const MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
];

function pickSupportedMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") {
    return undefined;
  }
  return MIME_CANDIDATES.find((candidate) => {
    try {
      return MediaRecorder.isTypeSupported(candidate);
    } catch {
      return false;
    }
  });
}

export function isVoiceCaptureSupported(): boolean {
  return (
    typeof MediaRecorder !== "undefined"
    && typeof navigator !== "undefined"
    && typeof navigator.mediaDevices?.getUserMedia === "function"
  );
}

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
export function createMediaRecorderSource(options?: MediaRecorderSourceOptions): VoiceAudioSourceFactory {
  const timesliceMs = Math.max(50, options?.timesliceMs ?? DEFAULT_TIMESLICE_MS);
  return async (handlers) => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: options?.audioConstraints ?? true,
    });
    const mimeType = options?.mimeType ?? pickSupportedMimeType();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) handlers.onChunk(event.data);
    };
    recorder.onerror = (event) => handlers.onError?.(event);
    const releaseTracks = () => {
      for (const track of stream.getTracks()) track.stop();
    };
    let stopped = false;
    return {
      start() {
        recorder.start(timesliceMs);
      },
      stop() {
        if (stopped) return;
        stopped = true;
        if (recorder.state === "inactive") {
          releaseTracks();
          return;
        }
        return new Promise<void>((resolve) => {
          recorder.onstop = () => {
            releaseTracks();
            resolve();
          };
          recorder.stop();
        });
      },
    };
  };
}

/**
 * Push-to-talk orchestration for the composer: owns the voice session, the
 * audio source lifecycle and the live transcript the host can stage into the
 * draft before sending. Never touches provider credentials itself.
 */
export function useVoiceCapture(options: UseVoiceCaptureOptions): VoiceCapture {
  const [status, setStatus] = useState<VoiceCaptureStatus>("idle");
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const sessionRef = useRef<VoiceSession | undefined>(undefined);
  const sourceRef = useRef<VoiceAudioSource | undefined>(undefined);
  const busyRef = useRef(false);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const supported = options.supported ?? isVoiceCaptureSupported();

  const stop = useCallback(() => {
    const source = sourceRef.current;
    const session = sessionRef.current;
    sourceRef.current = undefined;
    sessionRef.current = undefined;
    if (!source && !session) {
      busyRef.current = false;
      setStatus("idle");
      return;
    }
    void (async () => {
      try {
        await source?.stop();
      } catch {
        // Releasing the microphone must not break teardown.
      }
      session?.stop("stopped");
      busyRef.current = false;
      setStatus((current) => (current === "error" ? current : "idle"));
    })();
  }, []);

  const start = useCallback(() => {
    const opts = optionsRef.current;
    if (busyRef.current || sessionRef.current || sourceRef.current) return;
    if (!supported) {
      setStatus("error");
      opts.onError?.("unsupported");
      return;
    }
    busyRef.current = true;
    setStatus("starting");
    setTranscript("");
    setInterim("");

    void (async () => {
      const session = createVoiceSession({
        transport: opts.transport,
        ...(opts.meter ? { meter: opts.meter } : {}),
        ...(opts.model ? { model: opts.model } : {}),
        ...(opts.language ? { language: opts.language } : {}),
        ...(opts.tenantId ? { tenantId: opts.tenantId } : {}),
        ...(opts.organizationId ? { organizationId: opts.organizationId } : {}),
        handlers: {
          onTranscript: (frame) => {
            if (frame.isFinal) {
              setInterim("");
              setTranscript((current) => (current ? `${current} ${frame.text}` : frame.text));
            } else {
              setInterim(frame.text);
            }
            try {
              optionsRef.current.onTranscript?.(frame);
            } catch {
              // Host transcript handlers must not break capture.
            }
          },
          onError: (reason, error) => {
            sourceRef.current = undefined;
            sessionRef.current = undefined;
            busyRef.current = false;
            setStatus("error");
            try {
              optionsRef.current.onError?.(reason, error);
            } catch {
              // Host error handlers must not throw into transport callbacks.
            }
          },
          onClose: () => {
            sourceRef.current = undefined;
            sessionRef.current = undefined;
            busyRef.current = false;
            setStatus((current) => (current === "error" ? current : "idle"));
          },
        },
      });
      sessionRef.current = session;

      let source: VoiceAudioSource;
      try {
        const createSource = opts.createSource ?? createMediaRecorderSource();
        source = await createSource({
          onChunk: (chunk) => sessionRef.current?.push(chunk),
          onError: (error) => {
            try {
              optionsRef.current.onError?.("capture_failed", error);
            } catch {
              // Host error handlers must not throw into capture callbacks.
            }
          },
        });
      } catch (error) {
        // Microphone permission denied or source failure: the transport was
        // never opened, so nothing is billed for this capture.
        sessionRef.current = undefined;
        session.stop("error");
        busyRef.current = false;
        setStatus("error");
        try {
          optionsRef.current.onError?.("capture_failed", error);
        } catch {
          // Host error handlers must not throw into capture callbacks.
        }
        return;
      }
      sourceRef.current = source;

      const opened = await session.start();
      if (!opened || sessionRef.current !== session) {
        try {
          await source.stop();
        } catch {
          // Microphone release must not break teardown.
        }
        if (sessionRef.current === session) sessionRef.current = undefined;
        if (sourceRef.current === source) sourceRef.current = undefined;
        busyRef.current = false;
        setStatus("error");
        return;
      }

      try {
        await source.start();
      } catch (error) {
        sessionRef.current = undefined;
        sourceRef.current = undefined;
        session.stop("error");
        try {
          await source.stop();
        } catch {
          // Microphone release must not break teardown.
        }
        busyRef.current = false;
        setStatus("error");
        try {
          optionsRef.current.onError?.("capture_failed", error);
        } catch {
          // Host error handlers must not throw into capture callbacks.
        }
        return;
      }
      busyRef.current = false;
      setStatus("recording");
    })();
  }, [supported]);

  useEffect(() => () => {
    const source = sourceRef.current;
    const session = sessionRef.current;
    sourceRef.current = undefined;
    sessionRef.current = undefined;
    void Promise.resolve()
      .then(() => source?.stop())
      .catch(() => undefined)
      .then(() => session?.stop("aborted"));
  }, []);

  return { status, supported, transcript, interim, start, stop };
}
