import assert from "node:assert/strict";
import test from "node:test";

import { AgentServerError, createAgentServerClient } from "../dist/agent-server-client.js";

function stubFetch(responses) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({ url, init });
    const next = responses[calls.length - 1];
    if (next instanceof Error) throw next;
    return next;
  };
  return { calls, fetch };
}

const jsonResponse = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const client = (fetch) => createAgentServerClient({ baseUrl: "https://app.example", fetch });

test("listTools hace GET /agent/tools con query de contexto", async () => {
  const { calls, fetch } = stubFetch([jsonResponse(200, [])]);
  await client(fetch).listTools({ thread_id: "th-1", view: "guion" });
  assert.equal(calls[0].init.method, "GET");
  assert.match(calls[0].url, /\/agent\/tools\?/);
  assert.match(calls[0].url, /thread_id=th-1/);
  assert.match(calls[0].url, /view=guion/);
});

test("listTools sin contexto → /agent/tools sin query", async () => {
  const { calls, fetch } = stubFetch([jsonResponse(200, [])]);
  await client(fetch).listTools();
  assert.equal(calls[0].url, "https://app.example/agent/tools");
});

test("createProposal POST /agent/proposals con body", async () => {
  const { calls, fetch } = stubFetch([jsonResponse(200, { id: "p-1" })]);
  const out = await client(fetch).createProposal({ tool: "memoria.recordar", input: { dato: "x" } });
  assert.deepEqual(out, { id: "p-1" });
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].url, "https://app.example/agent/proposals");
  assert.deepEqual(JSON.parse(calls[0].init.body), { tool: "memoria.recordar", input: { dato: "x" } });
});

test("modify/accept/apply/discard usan las rutas de §5", async () => {
  const { calls, fetch } = stubFetch([
    jsonResponse(200, { id: "p-2" }),
    jsonResponse(200, { token: "tok-1", expires_in: 120 }),
    jsonResponse(200, { change_id: "chg-1" }),
    jsonResponse(200, { id: "p-1", state: "discarded" }),
  ]);
  const c = client(fetch);
  await c.modifyProposal("p-1", { input: { dato: "y" } });
  await c.acceptProposal("p-2");
  await c.applyProposal("p-2", { token: "tok-1", ack_irreversible: true });
  await c.discardProposal("p-1");
  assert.equal(calls[0].url, "https://app.example/agent/proposals/p-1/modify");
  assert.equal(calls[1].url, "https://app.example/agent/proposals/p-2/accept");
  assert.equal(calls[1].init.body, null);
  assert.equal(calls[2].url, "https://app.example/agent/proposals/p-2/apply");
  assert.deepEqual(JSON.parse(calls[2].init.body), { token: "tok-1", ack_irreversible: true });
  assert.equal(calls[3].url, "https://app.example/agent/proposals/p-1/discard");
});

test("revert-token / revert / compensate usan rutas de changes", async () => {
  const { calls, fetch } = stubFetch([
    jsonResponse(200, { token: "rt-1" }),
    jsonResponse(200, { change_id: "chg-1" }),
    jsonResponse(200, { change_id: "chg-2" }),
  ]);
  const c = client(fetch);
  await c.createRevertToken("chg-1");
  await c.revertChange("chg-1", { token: "rt-1" });
  await c.compensateChange("chg-2", { token: "rt-2", ack_irreversible: true });
  assert.equal(calls[0].url, "https://app.example/agent/changes/chg-1/revert-token");
  assert.equal(calls[1].url, "https://app.example/agent/changes/chg-1/revert");
  assert.equal(calls[2].url, "https://app.example/agent/changes/chg-2/compensate");
});

test("listProposals hace GET /agent/proposals?thread_id=", async () => {
  const { calls, fetch } = stubFetch([jsonResponse(200, [])]);
  await client(fetch).listProposals({ thread_id: "th-9" });
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[0].url, "https://app.example/agent/proposals?thread_id=th-9");
});

test("errores {code,message} mapean a AgentServerError con status y code", async () => {
  for (const [status, code] of [
    [400, "bad_request"],
    [403, "enrollment_missing_or_ambiguous"],
    [404, "not_found"],
    [409, "invalid_transition"],
    [410, "expired"],
    [422, "unprocessable"],
  ]) {
    const { fetch } = stubFetch([jsonResponse(status, { code, message: `m-${status}` })]);
    await assert.rejects(
      () => client(fetch).listProposals({ thread_id: "t" }),
      (error) =>
        error instanceof AgentServerError &&
        error.status === status &&
        error.code === code &&
        error.message === `m-${status}`,
      `status ${status}`,
    );
  }
});

test("cuerpo de error no-JSON → code http_error con status", async () => {
  const { fetch } = stubFetch([new Response("oops", { status: 500 })]);
  await assert.rejects(
    () => client(fetch).listTools(),
    (error) => error instanceof AgentServerError && error.status === 500 && error.code === "http_error",
  );
});

test("fallo de red → AgentServerError network_error (status 0)", async () => {
  const { fetch } = stubFetch([new TypeError("socket hangup")]);
  await assert.rejects(
    () => client(fetch).listTools(),
    (error) => error instanceof AgentServerError && error.status === 0 && error.code === "network_error",
  );
});

test("headers() inyecta sesión/CSRF en cada petición", async () => {
  const { calls, fetch } = stubFetch([jsonResponse(200, {})]);
  const c = createAgentServerClient({
    baseUrl: "https://app.example/",
    fetch,
    headers: async () => ({ "x-csrf": "csrf-1", authorization: "Bearer s" }),
  });
  await c.acceptProposal("p-1");
  assert.equal(calls[0].url, "https://app.example/agent/proposals/p-1/accept"); // baseUrl sin trailing slash
  assert.equal(calls[0].init.headers["x-csrf"], "csrf-1");
  assert.equal(calls[0].init.headers.authorization, "Bearer s");
});

test("204 → undefined sin parsear body", async () => {
  const { fetch } = stubFetch([new Response(null, { status: 204 })]);
  const out = await client(fetch).discardProposal("p-1");
  assert.equal(out, undefined);
});
