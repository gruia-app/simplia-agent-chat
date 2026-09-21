/**
 * Push-to-talk voice contract. The Deepgram API key never reaches the
 * browser: each app backend either mints an ephemeral token for a direct
 * socket or proxies the audio over its own WebSocket. Billing stays per-app —
 * the transport is configured per app and every session emits one
 * `VoiceUsageEvent` the host wires into its own quota system.
 */

export const DEFAULT_VOICE_MODEL = "nova-3";
export const DEFAULT_VOICE_LANGUAGE = "multi";
export const DEEPGRAM_LISTEN_URL = "wss://api.deepgram.com/v1/listen";

export interface VoiceSessionConfig {
  sessionId: string;
  /** Speech model negotiated with the backend. Defaults to `nova-3`. */
  model: string;
  /** BCP-47 or provider language tag. `multi` covers the Spanish fleet. */
  language: string;
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

export type VoiceTransportErrorReason =
  | "transport_failed"
  | "transport_closed"
  | "invalid_frame"
  | "token_failed";

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
  open(
    config: VoiceSessionConfig,
    handlers: VoiceTransportHandlers,
  ): VoiceTransportConnection | Promise<VoiceTransportConnection>;
}

/**
 * Per-session metering record emitted exactly once when a session ends. Apps
 * connect `meter` to their own quota/billing pipeline; nothing is shared.
 */
export interface VoiceUsageEvent {
  kind: "voice_session";
  sessionId: string;
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

export type VoiceSessionStatus =
  | "idle"
  | "connecting"
  | "open"
  | "closing"
  | "closed"
  | "error";

export interface CreateVoiceSessionOptions {
  transport: VoiceTransport;
  sessionId?: string;
  model?: string;
  language?: string;
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

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function defaultSessionId(): string {
  const randomUUID = (globalThis.crypto as { randomUUID?: () => string } | undefined)?.randomUUID;
  if (typeof randomUUID === "function") return `voice-${randomUUID.call(globalThis.crypto)}`;
  return `voice-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function chunkSize(chunk: Blob): number {
  return typeof chunk?.size === "number" && Number.isFinite(chunk.size) ? Math.max(0, chunk.size) : 0;
}

/**
 * Orchestrates one push-to-talk session over a caller-owned transport:
 * status machine, byte counting, transcript fan-out and the single metering
 * event. Audio capture (getUserMedia/MediaRecorder) stays in the host layer.
 */
export function createVoiceSession(options: CreateVoiceSessionOptions): VoiceSession {
  const now = options.now ?? Date.now;
  const isoNow = options.isoNow ?? (() => new Date().toISOString());
  const handlers = options.handlers ?? {};
  const config: VoiceSessionConfig = {
    sessionId: isNonEmptyString(options.sessionId) ? options.sessionId.trim() : defaultSessionId(),
    model: isNonEmptyString(options.model) ? options.model.trim() : DEFAULT_VOICE_MODEL,
    language: isNonEmptyString(options.language) ? options.language.trim() : DEFAULT_VOICE_LANGUAGE,
    ...(isNonEmptyString(options.tenantId) ? { tenantId: options.tenantId.trim() } : {}),
    ...(isNonEmptyString(options.organizationId) ? { organizationId: options.organizationId.trim() } : {}),
  };

  let status: VoiceSessionStatus = "idle";
  let connection: VoiceTransportConnection | undefined;
  let connectionClosed = false;
  let startedAtMs = 0;
  let startedAtIso = "";
  let audioBytes = 0;
  let finalTranscripts = 0;
  let usage: VoiceUsageEvent | undefined;

  const setStatus = (next: VoiceSessionStatus) => {
    if (status === next) return;
    status = next;
    options.onStatusChange?.(next);
  };

  const finish = (reason: VoiceSessionEndReason): VoiceUsageEvent => {
    if (usage) return usage;
    usage = {
      kind: "voice_session",
      sessionId: config.sessionId,
      model: config.model,
      language: config.language,
      ...(config.tenantId ? { tenantId: config.tenantId } : {}),
      ...(config.organizationId ? { organizationId: config.organizationId } : {}),
      startedAt: startedAtIso,
      endedAt: isoNow(),
      durationMs: Math.max(0, Math.round(now() - startedAtMs)),
      audioBytes,
      finalTranscripts,
      endReason: reason,
    };
    try {
      options.meter?.(usage);
    } catch {
      // A throwing meter must not break session teardown.
    }
    return usage;
  };

  const closeConnection = () => {
    if (connectionClosed || !connection) return;
    connectionClosed = true;
    try {
      connection.close();
    } catch {
      // Transport close must not throw into the caller's stop().
    }
  };

  const transportHandlers: VoiceTransportHandlers = {
    onTranscript: (frame) => {
      if (status !== "open") return;
      if (frame.isFinal) finalTranscripts += 1;
      try {
        handlers.onTranscript?.(frame);
      } catch {
        // Host transcript failures must not kill the session.
      }
    },
    onError: (reason, error) => {
      if (status === "closed" || status === "closing" || status === "error") return;
      closeConnection();
      finish("error");
      setStatus("error");
      try {
        handlers.onError?.(reason, error);
      } catch {
        // Host error handlers must not throw into transport callbacks.
      }
    },
    onClose: () => {
      if (status !== "open" && status !== "connecting") return;
      connectionClosed = true;
      finish(status === "connecting" ? "error" : "completed");
      setStatus("closed");
      try {
        handlers.onClose?.();
      } catch {
        // Host close handlers must not throw into transport callbacks.
      }
    },
  };

  const session: VoiceSession = {
    get status() {
      return status;
    },
    get config() {
      return config;
    },
    async start() {
      if (status !== "idle") return false;
      if (options.signal?.aborted) {
        startedAtMs = now();
        startedAtIso = isoNow();
        finish("aborted");
        setStatus("closed");
        return false;
      }
      setStatus("connecting");
      startedAtMs = now();
      startedAtIso = isoNow();
      let opened: VoiceTransportConnection;
      try {
        opened = await options.transport.open(config, transportHandlers);
      } catch (error) {
        finish("error");
        setStatus("error");
        handlers.onError?.("transport_failed", error);
        return false;
      }
      if (!opened || typeof opened.send !== "function" || typeof opened.close !== "function") {
        finish("error");
        setStatus("error");
        handlers.onError?.("transport_failed");
        return false;
      }
      connection = opened;
      if (options.signal?.aborted) {
        closeConnection();
        finish("aborted");
        setStatus("closed");
        return false;
      }
      setStatus("open");
      return true;
    },
    push(chunk) {
      if (status !== "open" || !connection || connectionClosed) return;
      audioBytes += chunkSize(chunk);
      try {
        connection.send(chunk);
      } catch (error) {
        transportHandlers.onError?.("transport_failed", error);
      }
    },
    stop(reason = "stopped") {
      if (usage) return usage;
      if (status === "idle") {
        startedAtMs = now();
        startedAtIso = isoNow();
      }
      setStatus("closing");
      closeConnection();
      const event = finish(status === "error" ? "error" : reason);
      setStatus("closed");
      return event;
    },
  };

  options.signal?.addEventListener("abort", () => {
    if (status === "idle" || status === "closed" || status === "closing" || status === "error") return;
    session.stop("aborted");
  });

  return session;
}

/** Minimal WebSocket surface the transports rely on (injectable for tests). */
export interface VoiceWebSocket {
  readonly readyState: number;
  binaryType: string;
  send(data: string | ArrayBuffer | Blob): void;
  close(): void;
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onclose: ((event: unknown) => void) | null;
}

export type VoiceWebSocketFactory = (
  url: string,
  protocols: string | string[] | undefined,
) => VoiceWebSocket;

function defaultWebSocketFactory(url: string, protocols: string | string[] | undefined): VoiceWebSocket {
  if (typeof globalThis.WebSocket !== "function") {
    throw new Error("WebSocket is not available in this environment");
  }
  return new globalThis.WebSocket(url, protocols) as unknown as VoiceWebSocket;
}

function frameFromJson(data: unknown): VoiceTranscriptFrame | "invalid" | "other" {
  if (typeof data !== "string") return "other";
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return "invalid";
  }
  if (typeof parsed !== "object" || parsed === null) return "invalid";
  const record = parsed as Record<string, unknown>;
  if (record.type === "transcript" && typeof record.text === "string") {
    return { text: record.text, isFinal: record.is_final === true || record.isFinal === true };
  }
  if (record.type === "error") return "invalid";
  if (record.type === "closed") return "invalid";
  return "other";
}

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
export function createDeepgramSocketTransport(options: DeepgramSocketTransportOptions): VoiceTransport {
  const factory = options.webSocketFactory ?? defaultWebSocketFactory;
  const setIntervalFn = options.setIntervalFn ?? ((fn: () => void, ms: number) => setInterval(fn, ms));
  const clearIntervalFn = options.clearIntervalFn ?? ((id: unknown) => clearInterval(id as Parameters<typeof clearInterval>[0]));
  return {
    async open(config, handlers) {
      const token = await options.getToken();
      if (!isNonEmptyString(token)) {
        handlers.onError?.("token_failed");
        throw new Error("ephemeral token missing");
      }
      const url = new URL(options.url ?? DEEPGRAM_LISTEN_URL);
      url.searchParams.set("model", config.model);
      url.searchParams.set("language", config.language);
      for (const [key, value] of Object.entries(options.params ?? {})) {
        url.searchParams.set(key, value);
      }
      const socket = factory(url.toString(), ["token", token.trim()]);
      socket.binaryType = "arraybuffer";

      return await new Promise<VoiceTransportConnection>((resolve, reject) => {
        let settled = false;
        let closed = false;
        let keepAlive: unknown;
        const clearKeepAlive = () => {
          if (keepAlive !== undefined) {
            clearIntervalFn(keepAlive);
            keepAlive = undefined;
          }
        };
        const fail = (reason: VoiceTransportErrorReason, error?: unknown) => {
          if (closed) return;
          closed = true;
          clearKeepAlive();
          handlers.onError?.(reason, error);
          if (!settled) {
            settled = true;
            try { socket.close(); } catch { /* ignore */ }
            reject(error instanceof Error ? error : new Error(reason));
          } else {
            handlers.onClose?.();
          }
        };
        socket.onopen = () => {
          if (settled) return;
          settled = true;
          if (options.keepAliveMs && options.keepAliveMs > 0) {
            keepAlive = setIntervalFn(() => {
              try { socket.send(JSON.stringify({ type: "KeepAlive" })); } catch { /* ignore */ }
            }, options.keepAliveMs);
          }
          resolve({
            send(chunk) {
              if (closed) return;
              try { socket.send(chunk); } catch { /* socket already closing */ }
            },
            close() {
              if (closed) return;
              closed = true;
              clearKeepAlive();
              try { socket.send(JSON.stringify({ type: "CloseStream" })); } catch { /* ignore */ }
              try { socket.close(); } catch { /* ignore */ }
            },
          });
        };
        socket.onmessage = (event) => {
          if (closed) return;
          const data = event.data;
          if (typeof data !== "string") return;
          let parsed: unknown;
          try {
            parsed = JSON.parse(data);
          } catch {
            return;
          }
          if (typeof parsed !== "object" || parsed === null) return;
          const record = parsed as Record<string, unknown>;
          if (record.type === "Results") {
            const channel = record.channel as { alternatives?: { transcript?: unknown }[] } | undefined;
            const text = channel?.alternatives?.[0]?.transcript;
            if (typeof text === "string" && text.length > 0) {
              handlers.onTranscript?.({ text, isFinal: record.is_final === true });
            }
            return;
          }
          if (record.type === "error" || record.type === "Error") {
            fail("transport_failed");
          }
        };
        socket.onerror = (event) => fail("transport_failed", event);
        socket.onclose = () => fail("transport_closed");
      });
    },
  };
}

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
export function createWebSocketProxyTransport(options: WebSocketProxyTransportOptions): VoiceTransport {
  const factory = options.webSocketFactory ?? defaultWebSocketFactory;
  return {
    async open(config, handlers) {
      const url = typeof options.url === "function" ? await options.url(config) : options.url;
      if (!isNonEmptyString(url)) {
        handlers.onError?.("transport_failed");
        throw new Error("proxy url missing");
      }
      const socket = factory(url.trim(), options.protocols);
      socket.binaryType = "arraybuffer";

      return await new Promise<VoiceTransportConnection>((resolve, reject) => {
        let settled = false;
        let closed = false;
        const fail = (reason: VoiceTransportErrorReason, error?: unknown) => {
          if (closed) return;
          closed = true;
          handlers.onError?.(reason, error);
          if (!settled) {
            settled = true;
            try { socket.close(); } catch { /* ignore */ }
            reject(error instanceof Error ? error : new Error(reason));
          } else {
            handlers.onClose?.();
          }
        };
        socket.onopen = () => {
          if (settled) return;
          settled = true;
          if (options.controlMessage !== undefined) {
            const base = typeof options.controlMessage === "object" && options.controlMessage !== null
              ? options.controlMessage as Record<string, unknown>
              : { value: options.controlMessage };
            try {
              socket.send(JSON.stringify({ ...base, config }));
            } catch (error) {
              fail("transport_failed", error);
              return;
            }
          }
          resolve({
            send(chunk) {
              if (closed) return;
              try { socket.send(chunk); } catch { /* socket already closing */ }
            },
            close() {
              if (closed) return;
              closed = true;
              try { socket.send(JSON.stringify({ type: "close" })); } catch { /* ignore */ }
              try { socket.close(); } catch { /* ignore */ }
            },
          });
        };
        socket.onmessage = (event) => {
          if (closed) return;
          const frame = frameFromJson(event.data);
          if (frame === "other") return;
          if (frame === "invalid") {
            fail("invalid_frame");
            return;
          }
          handlers.onTranscript?.(frame);
        };
        socket.onerror = (event) => fail("transport_failed", event);
        socket.onclose = () => fail("transport_closed");
      });
    },
  };
}

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
export function createScriptedVoiceTransport(options: ScriptedVoiceTransportOptions): VoiceTransport {
  const schedule = options.schedule ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const cancel = options.cancel ?? ((id: unknown) => clearTimeout(id as Parameters<typeof clearTimeout>[0]));
  const intervalMs = Math.max(0, options.intervalMs ?? 0);
  return {
    open(_config, handlers) {
      let closed = false;
      const pending: unknown[] = [];
      options.script.forEach((frame, index) => {
        pending.push(schedule(() => {
          if (closed) return;
          handlers.onTranscript?.(frame);
        }, intervalMs * (index + 1)));
      });
      return {
        send() {
          // Scripted transport accepts and discards audio bytes.
        },
        close() {
          if (closed) return;
          closed = true;
          for (const id of pending.splice(0)) cancel(id);
        },
      };
    },
  };
}
