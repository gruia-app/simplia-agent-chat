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
function isNonEmptyString(value) {
    return typeof value === "string" && value.trim().length > 0;
}
function defaultSessionId() {
    const randomUUID = globalThis.crypto?.randomUUID;
    if (typeof randomUUID === "function")
        return `voice-${randomUUID.call(globalThis.crypto)}`;
    return `voice-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
function chunkSize(chunk) {
    return typeof chunk?.size === "number" && Number.isFinite(chunk.size) ? Math.max(0, chunk.size) : 0;
}
/**
 * Orchestrates one push-to-talk session over a caller-owned transport:
 * status machine, byte counting, transcript fan-out and the single metering
 * event. Audio capture (getUserMedia/MediaRecorder) stays in the host layer.
 */
export function createVoiceSession(options) {
    const now = options.now ?? Date.now;
    const isoNow = options.isoNow ?? (() => new Date().toISOString());
    const handlers = options.handlers ?? {};
    const config = {
        sessionId: isNonEmptyString(options.sessionId) ? options.sessionId.trim() : defaultSessionId(),
        model: isNonEmptyString(options.model) ? options.model.trim() : DEFAULT_VOICE_MODEL,
        language: isNonEmptyString(options.language) ? options.language.trim() : DEFAULT_VOICE_LANGUAGE,
        ...(isNonEmptyString(options.tenantId) ? { tenantId: options.tenantId.trim() } : {}),
        ...(isNonEmptyString(options.organizationId) ? { organizationId: options.organizationId.trim() } : {}),
    };
    let status = "idle";
    let connection;
    let connectionClosed = false;
    let startedAtMs = 0;
    let startedAtIso = "";
    let audioBytes = 0;
    let finalTranscripts = 0;
    let usage;
    const setStatus = (next) => {
        if (status === next)
            return;
        status = next;
        options.onStatusChange?.(next);
    };
    const finish = (reason) => {
        if (usage)
            return usage;
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
        }
        catch {
            // A throwing meter must not break session teardown.
        }
        return usage;
    };
    const closeConnection = () => {
        if (connectionClosed || !connection)
            return;
        connectionClosed = true;
        try {
            connection.close();
        }
        catch {
            // Transport close must not throw into the caller's stop().
        }
    };
    const transportHandlers = {
        onTranscript: (frame) => {
            if (status !== "open")
                return;
            if (frame.isFinal)
                finalTranscripts += 1;
            try {
                handlers.onTranscript?.(frame);
            }
            catch {
                // Host transcript failures must not kill the session.
            }
        },
        onError: (reason, error) => {
            if (status === "closed" || status === "closing" || status === "error")
                return;
            closeConnection();
            finish("error");
            setStatus("error");
            try {
                handlers.onError?.(reason, error);
            }
            catch {
                // Host error handlers must not throw into transport callbacks.
            }
        },
        onClose: () => {
            if (status !== "open" && status !== "connecting")
                return;
            connectionClosed = true;
            finish(status === "connecting" ? "error" : "completed");
            setStatus("closed");
            try {
                handlers.onClose?.();
            }
            catch {
                // Host close handlers must not throw into transport callbacks.
            }
        },
    };
    const session = {
        get status() {
            return status;
        },
        get config() {
            return config;
        },
        async start() {
            if (status !== "idle")
                return false;
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
            let opened;
            try {
                opened = await options.transport.open(config, transportHandlers);
            }
            catch (error) {
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
            if (status !== "open" || !connection || connectionClosed)
                return;
            audioBytes += chunkSize(chunk);
            try {
                connection.send(chunk);
            }
            catch (error) {
                transportHandlers.onError?.("transport_failed", error);
            }
        },
        stop(reason = "stopped") {
            if (usage)
                return usage;
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
        if (status === "idle" || status === "closed" || status === "closing" || status === "error")
            return;
        session.stop("aborted");
    });
    return session;
}
function defaultWebSocketFactory(url, protocols) {
    if (typeof globalThis.WebSocket !== "function") {
        throw new Error("WebSocket is not available in this environment");
    }
    return new globalThis.WebSocket(url, protocols);
}
function frameFromJson(data) {
    if (typeof data !== "string")
        return "other";
    let parsed;
    try {
        parsed = JSON.parse(data);
    }
    catch {
        return "invalid";
    }
    if (typeof parsed !== "object" || parsed === null)
        return "invalid";
    const record = parsed;
    if (record.type === "transcript" && typeof record.text === "string") {
        return { text: record.text, isFinal: record.is_final === true || record.isFinal === true };
    }
    if (record.type === "error")
        return "invalid";
    if (record.type === "closed")
        return "invalid";
    return "other";
}
/**
 * Reference transport for the ephemeral-token pattern: browser connects to
 * Deepgram directly using `["token", ephemeral]` subprotocol auth, streams
 * MediaRecorder chunks upstream and maps `Results` frames to transcript
 * frames. The billing key stays server-side inside each app.
 */
export function createDeepgramSocketTransport(options) {
    const factory = options.webSocketFactory ?? defaultWebSocketFactory;
    const setIntervalFn = options.setIntervalFn ?? ((fn, ms) => setInterval(fn, ms));
    const clearIntervalFn = options.clearIntervalFn ?? ((id) => clearInterval(id));
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
            return await new Promise((resolve, reject) => {
                let settled = false;
                let closed = false;
                let keepAlive;
                const clearKeepAlive = () => {
                    if (keepAlive !== undefined) {
                        clearIntervalFn(keepAlive);
                        keepAlive = undefined;
                    }
                };
                const fail = (reason, error) => {
                    if (closed)
                        return;
                    closed = true;
                    clearKeepAlive();
                    handlers.onError?.(reason, error);
                    if (!settled) {
                        settled = true;
                        try {
                            socket.close();
                        }
                        catch { /* ignore */ }
                        reject(error instanceof Error ? error : new Error(reason));
                    }
                    else {
                        handlers.onClose?.();
                    }
                };
                socket.onopen = () => {
                    if (settled)
                        return;
                    settled = true;
                    if (options.keepAliveMs && options.keepAliveMs > 0) {
                        keepAlive = setIntervalFn(() => {
                            try {
                                socket.send(JSON.stringify({ type: "KeepAlive" }));
                            }
                            catch { /* ignore */ }
                        }, options.keepAliveMs);
                    }
                    resolve({
                        send(chunk) {
                            if (closed)
                                return;
                            try {
                                socket.send(chunk);
                            }
                            catch { /* socket already closing */ }
                        },
                        close() {
                            if (closed)
                                return;
                            closed = true;
                            clearKeepAlive();
                            try {
                                socket.send(JSON.stringify({ type: "CloseStream" }));
                            }
                            catch { /* ignore */ }
                            try {
                                socket.close();
                            }
                            catch { /* ignore */ }
                        },
                    });
                };
                socket.onmessage = (event) => {
                    if (closed)
                        return;
                    const data = event.data;
                    if (typeof data !== "string")
                        return;
                    let parsed;
                    try {
                        parsed = JSON.parse(data);
                    }
                    catch {
                        return;
                    }
                    if (typeof parsed !== "object" || parsed === null)
                        return;
                    const record = parsed;
                    if (record.type === "Results") {
                        const channel = record.channel;
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
/**
 * Reference transport for the backend-proxy pattern: audio chunks flow to the
 * app's own WebSocket; the app backend relays them to Deepgram and returns
 * normalized transcript frames. The provider key never leaves the app server.
 */
export function createWebSocketProxyTransport(options) {
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
            return await new Promise((resolve, reject) => {
                let settled = false;
                let closed = false;
                const fail = (reason, error) => {
                    if (closed)
                        return;
                    closed = true;
                    handlers.onError?.(reason, error);
                    if (!settled) {
                        settled = true;
                        try {
                            socket.close();
                        }
                        catch { /* ignore */ }
                        reject(error instanceof Error ? error : new Error(reason));
                    }
                    else {
                        handlers.onClose?.();
                    }
                };
                socket.onopen = () => {
                    if (settled)
                        return;
                    settled = true;
                    if (options.controlMessage !== undefined) {
                        const base = typeof options.controlMessage === "object" && options.controlMessage !== null
                            ? options.controlMessage
                            : { value: options.controlMessage };
                        try {
                            socket.send(JSON.stringify({ ...base, config }));
                        }
                        catch (error) {
                            fail("transport_failed", error);
                            return;
                        }
                    }
                    resolve({
                        send(chunk) {
                            if (closed)
                                return;
                            try {
                                socket.send(chunk);
                            }
                            catch { /* socket already closing */ }
                        },
                        close() {
                            if (closed)
                                return;
                            closed = true;
                            try {
                                socket.send(JSON.stringify({ type: "close" }));
                            }
                            catch { /* ignore */ }
                            try {
                                socket.close();
                            }
                            catch { /* ignore */ }
                        },
                    });
                };
                socket.onmessage = (event) => {
                    if (closed)
                        return;
                    const frame = frameFromJson(event.data);
                    if (frame === "other")
                        return;
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
/**
 * Deterministic scripted transport for labs and tests — no credentials, no
 * network. `send` only counts bytes upstream; the script plays back after
 * `open` and `close` cancels pending frames.
 */
export function createScriptedVoiceTransport(options) {
    const schedule = options.schedule ?? ((fn, ms) => setTimeout(fn, ms));
    const cancel = options.cancel ?? ((id) => clearTimeout(id));
    const intervalMs = Math.max(0, options.intervalMs ?? 0);
    return {
        open(_config, handlers) {
            let closed = false;
            const pending = [];
            options.script.forEach((frame, index) => {
                pending.push(schedule(() => {
                    if (closed)
                        return;
                    handlers.onTranscript?.(frame);
                }, intervalMs * (index + 1)));
            });
            return {
                send() {
                    // Scripted transport accepts and discards audio bytes.
                },
                close() {
                    if (closed)
                        return;
                    closed = true;
                    for (const id of pending.splice(0))
                        cancel(id);
                },
            };
        },
    };
}
//# sourceMappingURL=voice.js.map