/**
 * Push-to-talk voice contract. The Deepgram API key never reaches the
 * browser: each app backend either mints an ephemeral token for a direct
 * socket or proxies the audio over its own WebSocket. Billing stays per-app —
 * the transport is configured per app and every session emits one
 * `VoiceUsageEvent` the host wires into its own quota system.
 */
export declare const DEFAULT_VOICE_MODEL = "nova-3";
export declare const DEFAULT_VOICE_LANGUAGE = "multi";
export declare const DEFAULT_VOICE_PROVIDER = "deepgram";
export declare const DEEPGRAM_LISTEN_URL = "wss://api.deepgram.com/v1/listen";
export interface VoiceSessionConfig {
    sessionId: string;
    /** Speech model negotiated with the backend. Defaults to `nova-3`. */
    model: string;
    /** BCP-47 or provider language tag. `multi` covers the Spanish fleet. */
    language: string;
    /** Speech provider the session is billed against. Defaults to `deepgram`. */
    provider: string;
    /** Tenant the usage event is billed to. */
    tenantId?: string;
    /** Organization the usage event is billed to. */
    organizationId?: string;
}
export type VoiceSessionEndReason = "completed" | "stopped" | "error" | "aborted";
export interface VoiceTranscriptFrame {
    text: string;
    isFinal: boolean;
}
export type VoiceTransportErrorReason = "transport_failed" | "transport_closed" | "invalid_frame" | "token_failed";
export interface VoiceTransportHandlers {
    onTranscript?: ((frame: VoiceTranscriptFrame) => void) | undefined;
    onError?: ((reason: VoiceTransportErrorReason, error?: unknown) => void) | undefined;
    /** Remote or local close after `open` resolved. */
    onClose?: (() => void) | undefined;
}
/** Caller-owned audio sink. `send` receives encoded audio chunks. */
export interface VoiceTransportConnection {
    send(chunk: Blob): void;
    /** Idempotent. No callbacks fire after close returns. */
    close(): void;
}
/**
 * One streaming transcription connection. Implemented per app against its
 * own credentials: a Deepgram socket with an ephemeral token, or a WebSocket
 * proxied by the app backend. Never transports a raw provider key.
 */
export interface VoiceTransport {
    open(config: VoiceSessionConfig, handlers: VoiceTransportHandlers): VoiceTransportConnection | Promise<VoiceTransportConnection>;
}
/**
 * Per-session metering record emitted exactly once when a session ends. Apps
 * connect `meter` to their own quota/billing pipeline; nothing is shared.
 * Quota systems consuming snake_case map `tenantId` → `tenant_id` and
 * `durationMs` → `duration_ms`; `provider` identifies the billed service.
 */
export interface VoiceUsageEvent {
    kind: "voice_session";
    sessionId: string;
    provider: string;
    model: string;
    language: string;
    tenantId?: string;
    organizationId?: string;
    startedAt: string;
    endedAt: string;
    durationMs: number;
    /** Total encoded audio bytes accepted by the transport. */
    audioBytes: number;
    /** Count of `isFinal` transcript frames received. */
    finalTranscripts: number;
    endReason: VoiceSessionEndReason;
}
export type VoiceUsageMeter = (event: VoiceUsageEvent) => void;
export type VoiceSessionStatus = "idle" | "connecting" | "open" | "closing" | "closed" | "error";
export interface CreateVoiceSessionOptions {
    transport: VoiceTransport;
    sessionId?: string;
    model?: string;
    language?: string;
    provider?: string;
    tenantId?: string;
    organizationId?: string;
    meter?: VoiceUsageMeter;
    handlers?: VoiceTransportHandlers | undefined;
    onStatusChange?: ((status: VoiceSessionStatus) => void) | undefined;
    signal?: AbortSignal;
    now?: () => number;
    isoNow?: () => string;
}
export interface VoiceSession {
    readonly status: VoiceSessionStatus;
    readonly config: VoiceSessionConfig;
    /**
     * Opens the transport. Resolves false when the session was already started
     * or the open failed (status `error`); handlers still observe the error.
     */
    start(): Promise<boolean>;
    /** Forwards one audio chunk while open. Ignored in any other status. */
    push(chunk: Blob): void;
    /**
     * Idempotent close. Emits the single metering event on first call and
     * returns it; later calls return the stored event.
     */
    stop(reason?: VoiceSessionEndReason): VoiceUsageEvent | undefined;
}
/**
 * Orchestrates one push-to-talk session over a caller-owned transport:
 * status machine, byte counting, transcript fan-out and the single metering
 * event. Audio capture (getUserMedia/MediaRecorder) stays in the host layer.
 */
export declare function createVoiceSession(options: CreateVoiceSessionOptions): VoiceSession;
/** Minimal WebSocket surface the transports rely on (injectable for tests). */
export interface VoiceWebSocket {
    readonly readyState: number;
    binaryType: string;
    send(data: string | ArrayBuffer | Blob): void;
    close(): void;
    onopen: ((event: unknown) => void) | null;
    onmessage: ((event: {
        data: unknown;
    }) => void) | null;
    onerror: ((event: unknown) => void) | null;
    onclose: ((event: unknown) => void) | null;
}
export type VoiceWebSocketFactory = (url: string, protocols: string | string[] | undefined) => VoiceWebSocket;
export interface DeepgramSocketTransportOptions {
    /**
     * App-owned callback returning a short-lived ephemeral token minted by the
     * app backend. The backend holds `DEEPGRAM_API_KEY`; the browser only ever
     * sees the ephemeral value.
     */
    getToken: () => string | Promise<string>;
    url?: string;
    /** Extra Deepgram query params (smart_format, encoding, sample_rate, …). */
    params?: Record<string, string>;
    /** Send a KeepAlive frame at this interval while open. 0 disables. */
    keepAliveMs?: number;
    webSocketFactory?: VoiceWebSocketFactory;
    setIntervalFn?: (fn: () => void, ms: number) => unknown;
    clearIntervalFn?: (id: unknown) => void;
}
/**
 * Reference transport for the ephemeral-token pattern: browser connects to
 * Deepgram directly using `["token", ephemeral]` subprotocol auth, streams
 * MediaRecorder chunks upstream and maps `Results` frames to transcript
 * frames. The billing key stays server-side inside each app.
 */
export declare function createDeepgramSocketTransport(options: DeepgramSocketTransportOptions): VoiceTransport;
export interface WebSocketProxyTransportOptions {
    /**
     * App backend endpoint that accepts the audio stream and returns
     * `{ type: "transcript", text, is_final }` frames downstream. The backend
     * owns the provider key and the upstream connection.
     */
    url: string | ((config: VoiceSessionConfig) => string | Promise<string>);
    protocols?: string | string[];
    /**
     * Optional JSON control frame sent once the socket opens — e.g.
     * `{ type: "start", model, language, tenant_id }`. The session config is
     * merged under `config` when the value is an object.
     */
    controlMessage?: unknown;
    webSocketFactory?: VoiceWebSocketFactory;
}
/**
 * Reference transport for the backend-proxy pattern: audio chunks flow to the
 * app's own WebSocket; the app backend relays them to Deepgram and returns
 * normalized transcript frames. The provider key never leaves the app server.
 */
export declare function createWebSocketProxyTransport(options: WebSocketProxyTransportOptions): VoiceTransport;
export interface ScriptedVoiceTransportOptions {
    /** Frames emitted after `open`, in order. */
    script: readonly VoiceTranscriptFrame[];
    /** Milliseconds between frames. Default 0 (same task). */
    intervalMs?: number;
    /** Injectable scheduler for tests; defaults to setTimeout. */
    schedule?: (fn: () => void, ms: number) => unknown;
    cancel?: (id: unknown) => void;
}
/**
 * Deterministic scripted transport for labs and tests — no credentials, no
 * network. `send` only counts bytes upstream; the script plays back after
 * `open` and `close` cancels pending frames.
 */
export declare function createScriptedVoiceTransport(options: ScriptedVoiceTransportOptions): VoiceTransport;
//# sourceMappingURL=voice.d.ts.map