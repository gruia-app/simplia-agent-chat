import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_VOICE_LANGUAGE,
  DEFAULT_VOICE_MODEL,
  createDeepgramSocketTransport,
  createScriptedVoiceTransport,
  createVoiceSession,
  createWebSocketProxyTransport,
} from "../dist/index.js";

const config = { sessionId: "sess-1", tenantId: "tenant-9", organizationId: "org-2" };

function makeTransport(behavior = {}) {
  const sent = [];
  const handlersRef = { current: undefined };
  return {
    sent,
    transport: {
      open: async (_config, handlers) => {
        handlersRef.current = handlers;
        return {
          send: (chunk) => sent.push(chunk),
          close: () => behavior.onClose?.(),
        };
      },
    },
    handlers: handlersRef,
  };
}

function fakeSocket() {
  const socket = {
    readyState: 0,
    binaryType: "",
    sent: [],
    onopen: null,
    onmessage: null,
    onerror: null,
    onclose: null,
    send(data) { socket.sent.push(data); },
    close() { socket.readyState = 3; socket.onclose?.({}); },
    emitOpen() { socket.readyState = 1; socket.onopen?.({}); },
    emitMessage(data) { socket.onmessage?.({ data }); },
  };
  return socket;
}

function fakeFactory(socket) {
  return (url, protocols) => {
    socket.url = url;
    socket.protocols = protocols;
    queueMicrotask(() => socket.emitOpen());
    return socket;
  };
}

test("createVoiceSession emits one metering event with usage", async () => {
  const events = [];
  const { transport, sent } = makeTransport();
  const session = createVoiceSession({
    transport,
    meter: (event) => events.push(event),
    ...config,
  });
  assert.equal(session.config.model, DEFAULT_VOICE_MODEL);
  assert.equal(session.config.language, DEFAULT_VOICE_LANGUAGE);

  assert.equal(await session.start(), true);
  session.push(new Blob(["aa"]));
  session.push(new Blob(["bbbb"]));
  const event = session.stop();
  assert.equal(event.kind, "voice_session");
  assert.equal(event.tenantId, "tenant-9");
  assert.equal(event.organizationId, "org-2");
  assert.equal(event.audioBytes, 6);
  assert.equal(event.endReason, "stopped");
  assert.equal(events.length, 1);
  assert.equal(session.stop(), event);
  assert.equal(events.length, 1);
  assert.equal(session.status, "closed");
  assert.equal(sent.length, 2);
});

test("createVoiceSession counts final transcripts and ignores late frames", async () => {
  const { transport, handlers } = makeTransport();
  const frames = [];
  const events = [];
  const session = createVoiceSession({
    transport,
    ...config,
    meter: (event) => events.push(event),
    handlers: { onTranscript: (frame) => frames.push(frame) },
  });
  await session.start();
  handlers.current.onTranscript({ text: "hola", isFinal: false });
  handlers.current.onTranscript({ text: "hola mundo", isFinal: true });
  const event = session.stop();
  assert.equal(event.finalTranscripts, 1);
  assert.equal(frames.length, 2);
  handlers.current.onTranscript({ text: "late", isFinal: true });
  assert.equal(frames.length, 2);
});

test("createVoiceSession error path meters once and reports", async () => {
  const events = [];
  const errors = [];
  const { transport, handlers } = makeTransport();
  const session = createVoiceSession({
    transport,
    ...config,
    meter: (event) => events.push(event),
    handlers: { onError: (reason) => errors.push(reason) },
  });
  await session.start();
  handlers.current.onError("transport_failed", new Error("ws"));
  assert.equal(session.status, "error");
  assert.equal(events.length, 1);
  assert.equal(events[0].endReason, "error");
  assert.deepEqual(errors, ["transport_failed"]);
  assert.equal(session.stop().endReason, "error");
});

test("createVoiceSession remote close meters as completed", async () => {
  const events = [];
  const { transport, handlers } = makeTransport();
  const session = createVoiceSession({ transport, ...config, meter: (e) => events.push(e) });
  await session.start();
  handlers.current.onClose();
  assert.equal(session.status, "closed");
  assert.equal(events[0].endReason, "completed");
});

test("createVoiceSession open failure returns false and meters error", async () => {
  const events = [];
  const errors = [];
  const session = createVoiceSession({
    transport: { open: async () => { throw new Error("no socket"); } },
    ...config,
    meter: (e) => events.push(e),
    handlers: { onError: (reason) => errors.push(reason) },
  });
  assert.equal(await session.start(), false);
  assert.equal(session.status, "error");
  assert.equal(events[0].endReason, "error");
  assert.deepEqual(errors, ["transport_failed"]);
});

test("createVoiceSession abort signal ends session as aborted", async () => {
  const events = [];
  const controller = new AbortController();
  const { transport } = makeTransport();
  const session = createVoiceSession({
    transport,
    ...config,
    signal: controller.signal,
    meter: (e) => events.push(e),
  });
  await session.start();
  controller.abort();
  assert.equal(session.status, "closed");
  assert.equal(events[0].endReason, "aborted");
});

test("createScriptedVoiceTransport replays frames and close cancels", async () => {
  const frames = [];
  const scheduled = [];
  const transport = createScriptedVoiceTransport({
    script: [{ text: "a", isFinal: false }, { text: "a b", isFinal: true }],
    schedule: (fn, ms) => { scheduled.push(fn); return scheduled.length; },
    cancel: () => {},
  });
  const events = [];
  const session = createVoiceSession({
    transport,
    ...config,
    meter: (e) => events.push(e),
    handlers: { onTranscript: (f) => frames.push(f) },
  });
  await session.start();
  assert.equal(scheduled.length, 2);
  scheduled[0]();
  scheduled[1]();
  assert.deepEqual(frames.map((f) => f.text), ["a", "a b"]);
  const event = session.stop();
  assert.equal(event.finalTranscripts, 1);
});

test("createDeepgramSocketTransport builds listen url and maps Results", async () => {
  const socket = fakeSocket();
  const frames = [];
  const transport = createDeepgramSocketTransport({
    getToken: async () => "eph-token",
    params: { smart_format: "true" },
    webSocketFactory: fakeFactory(socket),
  });
  const connection = await transport.open(
    { sessionId: "s", model: "nova-3", language: "multi" },
    { onTranscript: (f) => frames.push(f) },
  );
  assert.ok(socket.url.startsWith("wss://api.deepgram.com/v1/listen?"));
  assert.ok(socket.url.includes("model=nova-3"));
  assert.ok(socket.url.includes("language=multi"));
  assert.ok(socket.url.includes("smart_format=true"));
  assert.deepEqual(socket.protocols, ["token", "eph-token"]);

  socket.emitMessage(JSON.stringify({
    type: "Results",
    is_final: true,
    channel: { alternatives: [{ transcript: "hola mundo" }] },
  }));
  assert.deepEqual(frames, [{ text: "hola mundo", isFinal: true }]);

  connection.close();
  assert.equal(socket.sent.at(-1), JSON.stringify({ type: "CloseStream" }));
});

test("createDeepgramSocketTransport rejects missing token", async () => {
  const errors = [];
  const transport = createDeepgramSocketTransport({
    getToken: async () => "",
    webSocketFactory: () => { throw new Error("should not open"); },
  });
  await assert.rejects(() => transport.open(
    { sessionId: "s", model: "nova-3", language: "multi" },
    { onError: (r) => errors.push(r) },
  ));
  assert.deepEqual(errors, ["token_failed"]);
});

test("createWebSocketProxyTransport sends control frame and maps transcript frames", async () => {
  const socket = fakeSocket();
  const frames = [];
  const transport = createWebSocketProxyTransport({
    url: (config) => `wss://app.example/voice?tenant=${config.tenantId}`,
    protocols: "voice.v1",
    controlMessage: { type: "start" },
    webSocketFactory: fakeFactory(socket),
  });
  const connection = await transport.open(
    { sessionId: "s", model: "nova-3", language: "multi", tenantId: "t-1" },
    { onTranscript: (f) => frames.push(f) },
  );
  assert.equal(socket.url, "wss://app.example/voice?tenant=t-1");
  assert.equal(socket.protocols, "voice.v1");
  const control = JSON.parse(socket.sent[0]);
  assert.equal(control.type, "start");
  assert.equal(control.config.tenantId, "t-1");

  socket.emitMessage(JSON.stringify({ type: "transcript", text: "hola", is_final: true }));
  assert.deepEqual(frames, [{ text: "hola", isFinal: true }]);

  connection.close();
  assert.equal(socket.sent.at(-1), JSON.stringify({ type: "close" }));
});
