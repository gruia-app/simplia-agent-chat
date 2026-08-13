import assert from "node:assert/strict";
import test from "node:test";

import { decodeSsePayload, SseDecoder } from "../dist/index.js";

function decodeByChunks(text, cuts) {
  const decoder = new SseDecoder();
  const output = [];
  let offset = 0;
  for (const size of cuts) {
    output.push(...decoder.push(text.slice(offset, offset + size)));
    offset += size;
  }
  output.push(...decoder.push(text.slice(offset)));
  output.push(...decoder.flush());
  return output;
}

test("decodes arbitrary chunk boundaries including split CRLF", () => {
  const wire = "event: token\r\nid: 42\r\nretry: 1500\r\ndata: {\"text\":\"hola\"}\r\n\r\n";
  const expected = [{ event: "token", id: "42", retry: 1500, data: "{\"text\":\"hola\"}" }];

  assert.deepEqual(decodeByChunks(wire, [1, 2, 3, 5, 8, 13]), expected);
  assert.deepEqual(decodeByChunks(wire, Array(wire.length).fill(1)), expected);
});

test("ignores comments and unknown fields, joins multiline data", () => {
  const decoder = new SseDecoder();
  const messages = decoder.push(
    ": heartbeat\nunknown: ignored\nevent: update\ndata: first\ndata: second\n\n",
  );
  assert.deepEqual(messages, [{ event: "update", data: "first\nsecond" }]);
});

test("persists last event id but scopes retry to one dispatched event", () => {
  const decoder = new SseDecoder();
  const messages = decoder.push(
    "id: abc\nretry: 12\ndata: one\n\ndata: two\n\n",
  );
  assert.deepEqual(messages, [
    { event: "message", data: "one", id: "abc", retry: 12 },
    { event: "message", data: "two", id: "abc" },
  ]);
});

test("rejects null-containing ids and invalid retry values", () => {
  const decoder = new SseDecoder();
  const messages = decoder.push(
    "id: safe\ndata: first\n\nid: bad\0id\nretry: -1\nretry: 1.5\ndata: second\n\n",
  );
  assert.deepEqual(messages, [
    { event: "message", data: "first", id: "safe" },
    { event: "message", data: "second", id: "safe" },
  ]);
});

test("flush dispatches a final event without a trailing blank line", () => {
  const decoder = new SseDecoder();
  assert.deepEqual(decoder.push("event: final\ndata: value"), []);
  assert.deepEqual(decoder.flush(), [{ event: "final", data: "value" }]);
  assert.deepEqual(decoder.flush(), []);
});

test("reset discards partial frames and event metadata", () => {
  const decoder = new SseDecoder();
  decoder.push("event: discarded\ndata: partial");
  decoder.reset();
  assert.deepEqual(decoder.push("data: fresh\n\n"), [{ event: "message", data: "fresh" }]);
});

test("decodes JSON payloads and the OpenAI [DONE] sentinel", () => {
  assert.deepEqual(decodeSsePayload({ event: "message", data: "{\"ok\":true}" }), { ok: true });
  assert.equal(decodeSsePayload({ event: "message", data: "  [DONE]  " }), "[DONE]");
  assert.throws(() => decodeSsePayload({ event: "message", data: "not-json" }), SyntaxError);
});
