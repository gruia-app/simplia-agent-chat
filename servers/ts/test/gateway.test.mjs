/** Batería §9.3/§9.4 del modo delegado del gateway (F1.6):
 *
 * - aserción: firma, aud, exp-iat<=60s, jti un solo uso → replay 401;
 * - token de servicio sin aserción → 401;
 * - escrituras por MCP crean Proposal y devuelven ProposalRef (sin ejecutar);
 * - apply/revert por elicitation solo con cliente verificado + org
 *   activada + reversible/card + accept; el resto → review_url sin ejecutar;
 * - get/apply/revert anti-IDOR → 404; review_url sin token.
 */

import assert from "node:assert/strict";
import { createPublicKey, generateKeyPairSync } from "node:crypto";
import test from "node:test";

import {
  DelegatedGateway,
  cliApplyAllowed,
  issueTestAssertion,
  jwksResolverFromDocument,
} from "../dist/index.js";
import {
  APP,
  OTHER_ORG,
  ORG,
  USER,
  expectError,
  makeService,
  mcpEntitlement,
  propose,
} from "./helpers.mjs";

const SVC = "svc-channel-token";
const CLIENT = "cli-mcp-1";
const MCP_WRITE = `${APP}__memoria__recordar`;
const MCP_IRREVERSIBLE = `${APP}__crm__borrar_cuenta`;
const SYS_APPLY = `${APP}__proposal__apply`;
const SYS_REVERT = `${APP}__proposal__revert`;
const SYS_GET = `${APP}__proposal__get`;

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

// §9.4: JWKS de fixture — el gateway resuelve la clave por kid.
const JWKS = {
  keys: [
    {
      ...createPublicKey(publicKey).export({ format: "jwk" }),
      kid: "test-key",
      use: "sig",
      alg: "RS256",
    },
  ],
};

function makeGateway({ elicit, entitlement } = {}) {
  const { service, storage, reversible, irreversible, sink } = makeService({
    entitlement: entitlement ?? mcpEntitlement(),
  });
  const gateway = new DelegatedGateway({
    service,
    appKey: APP,
    jwksResolver: jwksResolverFromDocument(JWKS),
    serviceTokenVerifier: (t) => t === SVC,
    verifiedClients: new Set([CLIENT]),
    reviewUrlTemplate: "https://app.example/agent/proposals/{proposal_id}",
    elicit: elicit ?? (() => "accept"),
  });
  return { gateway, service, storage, reversible, irreversible, sink };
}

function assertion({ org = ORG, user = USER, scopes = null, lifetimeS = 60, ...kw } = {}) {
  return issueTestAssertion({
    privateKey,
    appKey: APP,
    sub: user,
    org,
    scopes: scopes ?? [`app:${APP}`, "tool:*"],
    lifetimeS,
    ...kw,
  });
}

const AUTH = () => ({ serviceToken: SVC, assertion: assertion() });

// ------------------------------------------------------------- aserción

test("token de servicio sin aserción → 401", async () => {
  const { gateway } = makeGateway();
  await expectError(
    gateway.callTool(MCP_WRITE, { fact: "x" }, { serviceToken: SVC }),
    401,
    "assertion_required",
  );
});

test("sin token de servicio → 401 aunque la aserción sea válida", async () => {
  const { gateway } = makeGateway();
  await expectError(
    gateway.callTool(MCP_WRITE, { fact: "x" }, { assertion: assertion() }),
    401,
    "invalid_service_token",
  );
});

test("aud distinto del app_key → 401", async () => {
  const { gateway } = makeGateway();
  const bad = issueTestAssertion({
    privateKey,
    appKey: "otra-app",
    sub: USER,
    org: ORG,
    scopes: [`app:${APP}`, "tool:*"],
  });
  await expectError(
    gateway.callTool(MCP_WRITE, { fact: "x" }, { serviceToken: SVC, assertion: bad }),
    401,
  );
});

test("firma inválida → 401", async () => {
  const { gateway } = makeGateway();
  const other = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const bad = issueTestAssertion({
    privateKey: other.privateKey,
    appKey: APP,
    sub: USER,
    org: ORG,
    scopes: [`app:${APP}`, "tool:*"],
  });
  await expectError(
    gateway.callTool(MCP_WRITE, { fact: "x" }, { serviceToken: SVC, assertion: bad }),
    401,
  );
});

test("exp-iat > 60 s → 401", async () => {
  const { gateway } = makeGateway();
  await expectError(
    gateway.callTool(MCP_WRITE, { fact: "x" }, { serviceToken: SVC, assertion: assertion({ lifetimeS: 120 }) }),
    401,
  );
});

test("aserción expirada → 401", async () => {
  const { gateway } = makeGateway();
  const past = new Date(Date.now() - 120_000);
  await expectError(
    gateway.callTool(MCP_WRITE, { fact: "x" }, {
      serviceToken: SVC,
      assertion: assertion({ now: past }),
    }),
    401,
  );
});

test("jti repetido → 401 (un solo uso)", async () => {
  const { gateway } = makeGateway();
  const jwt = assertion({ jti: "jti-dup" });
  await gateway.callTool(`${APP}__proposal__get`, { proposal_id: "nope" }, { serviceToken: SVC, assertion: jwt }).catch((e) => {
    // la primera llamada falla por proposal inexistente — el jti ya quedó gastado
    assert.equal(e.status, 404);
  });
  await expectError(
    gateway.callTool(MCP_WRITE, { fact: "x" }, { serviceToken: SVC, assertion: jwt }),
    401,
    "assertion_replayed",
  );
});

test("scope ausente → 403", async () => {
  const { gateway } = makeGateway();
  await expectError(
    gateway.callTool(MCP_WRITE, { fact: "x" }, {
      serviceToken: SVC,
      assertion: assertion({ scopes: [`app:${APP}`] }),
    }),
    403,
    "scope_denied",
  );
});

test("org sin mcp_access → 403", async () => {
  const { gateway } = makeGateway({ entitlement: mcpEntitlement({ mcp_access: false }) });
  await expectError(
    gateway.callTool(MCP_WRITE, { fact: "x" }, AUTH()),
    403,
    "mcp_access_denied",
  );
});

// ------------------------------------------------------------- §9.2

test("escritura por MCP crea Proposal y devuelve ProposalRef sin ejecutar", async () => {
  const { gateway, service, reversible } = makeGateway();
  const res = await gateway.callTool(MCP_WRITE, { fact: "x" }, AUTH());
  const ref = res.structuredContent;
  assert.ok(ref.proposal_id);
  assert.equal(ref.tool, "memoria.recordar");
  assert.equal(ref.effect, "reversible");
  assert.equal(ref.confirm_effective, "card");
  assert.ok(ref.expires_at);
  assert.equal(reversible.applied.length, 0); // nunca aplica por MCP
  const stored = await service.storage.getProposal(ref.proposal_id);
  assert.equal(stored.user_id, USER);
});

test("review_url contiene solo el proposal_id, nunca un token", async () => {
  const { gateway } = makeGateway();
  const res = await gateway.callTool(MCP_WRITE, { fact: "x" }, AUTH());
  const ref = res.structuredContent;
  assert.equal(ref.review_url, `https://app.example/agent/proposals/${ref.proposal_id}`);
});

test("nombre MCP desconocido → error", async () => {
  const { gateway } = makeGateway();
  await expectError(gateway.callTool("otra-app__memoria__recordar", {}, AUTH()), 404);
  await assert.rejects(gateway.callTool(`${APP}__memoria__inexistente`, {}, AUTH()));
});

// ------------------------------------------------------------- §9.3 apply

async function proposalViaMcp(gateway) {
  const res = await gateway.callTool(MCP_WRITE, { fact: "x" }, AUTH());
  return res.structuredContent.proposal_id;
}

test("apply por elicitation ejecuta cuando se cumplen todas las condiciones", async () => {
  const { gateway, reversible } = makeGateway();
  const pid = await proposalViaMcp(gateway);
  const res = await gateway.callTool(SYS_APPLY, { proposal_id: pid }, AUTH());
  assert.ok(res.change_id);
  assert.equal(reversible.applied.length, 1);
});

test("apply devuelve review_url si el usuario declina la elicitation", async () => {
  const { gateway, reversible } = makeGateway({ elicit: () => "decline" });
  const pid = await proposalViaMcp(gateway);
  const res = await gateway.callTool(SYS_APPLY, { proposal_id: pid }, AUTH());
  assert.ok(res.review_url.includes(pid));
  assert.equal(reversible.applied.length, 0);
});

test("apply devuelve review_url con cliente no verificado", async () => {
  const { gateway, reversible } = makeGateway();
  const pid = await proposalViaMcp(gateway);
  const res = await gateway.callTool(SYS_APPLY, { proposal_id: pid }, {
    serviceToken: SVC,
    assertion: assertion({ clientId: "cli-desconocido" }),
  });
  assert.ok(res.review_url);
  assert.equal(reversible.applied.length, 0);
});

test("apply devuelve review_url si la org no activó elicitation_apply", async () => {
  const { gateway, reversible } = makeGateway({ entitlement: mcpEntitlement({ elicitation_apply: false }) });
  const pid = await proposalViaMcp(gateway);
  const res = await gateway.callTool(SYS_APPLY, { proposal_id: pid }, AUTH());
  assert.ok(res.review_url);
  assert.equal(reversible.applied.length, 0);
});

test("apply devuelve review_url para confirmación strong", async () => {
  const { gateway, irreversible } = makeGateway();
  const res = await gateway.callTool(MCP_IRREVERSIBLE, { account: "acc-1" }, AUTH());
  const out = await gateway.callTool(SYS_APPLY, { proposal_id: res.structuredContent.proposal_id }, AUTH());
  assert.ok(out.review_url);
  assert.equal(irreversible.applied.length, 0);
});

test("apply devuelve review_url para efecto irreversible", async () => {
  const { gateway, irreversible } = makeGateway();
  const res = await gateway.callTool(MCP_IRREVERSIBLE, { account: "acc-1" }, AUTH());
  assert.equal(res.structuredContent.effect, "irreversible");
  const out = await gateway.callTool(SYS_APPLY, { proposal_id: res.structuredContent.proposal_id }, AUTH());
  assert.ok(out.review_url);
  assert.equal(irreversible.applied.length, 0);
});

// ------------------------------------------------------------- §9.3 get/revert + anti-IDOR

test("get devuelve la proposal del sujeto", async () => {
  const { gateway } = makeGateway();
  const pid = await proposalViaMcp(gateway);
  const res = await gateway.callTool(SYS_GET, { proposal_id: pid }, AUTH());
  assert.equal(res.proposal.id, pid);
});

test("get de otra org → 404 (anti-IDOR)", async () => {
  const { gateway } = makeGateway();
  const pid = await proposalViaMcp(gateway);
  await expectError(
    gateway.callTool(SYS_GET, { proposal_id: pid }, { serviceToken: SVC, assertion: assertion({ org: OTHER_ORG }) }),
    404,
  );
});

test("apply de otro user → 404 (anti-IDOR)", async () => {
  const { gateway, reversible } = makeGateway();
  const pid = await proposalViaMcp(gateway);
  await expectError(
    gateway.callTool(SYS_APPLY, { proposal_id: pid }, { serviceToken: SVC, assertion: assertion({ user: "otro" }) }),
    404,
  );
  assert.equal(reversible.applied.length, 0);
});

test("get de proposal inexistente → 404", async () => {
  const { gateway } = makeGateway();
  await expectError(gateway.callTool(SYS_GET, { proposal_id: "nope" }, AUTH()), 404);
});

test("revert por elicitation ejecuta con token de revert", async () => {
  const { gateway, reversible } = makeGateway();
  const pid = await proposalViaMcp(gateway);
  const applied = await gateway.callTool(SYS_APPLY, { proposal_id: pid }, AUTH());
  const res = await gateway.callTool(SYS_REVERT, { change_id: applied.change_id }, AUTH());
  assert.equal(res.change.change_id, applied.change_id);
  assert.equal(reversible.reverted.length, 1);
});

test("revert de otro user → 404 (anti-IDOR)", async () => {
  const { gateway } = makeGateway();
  const pid = await proposalViaMcp(gateway);
  const applied = await gateway.callTool(SYS_APPLY, { proposal_id: pid }, AUTH());
  await expectError(
    gateway.callTool(SYS_REVERT, { change_id: applied.change_id }, { serviceToken: SVC, assertion: assertion({ user: "otro" }) }),
    404,
  );
});

test("auditoría registra via=mcp y client_id", async () => {
  const { gateway, sink } = makeGateway();
  const pid = await proposalViaMcp(gateway);
  await gateway.callTool(SYS_APPLY, { proposal_id: pid }, AUTH());
  const applied = sink.events.find((e) => e.action === "applied");
  assert.equal(applied.via, "mcp");
  assert.equal(applied.client_id, CLIENT);
  assert.equal(applied.client_verified, true);
  assert.equal(applied.confirm_channel, "elicitation");
});

// ------------------------------------------------------------- §9.4 JWKS

test("kid no presente en el JWKS → 401", async () => {
  const { gateway } = makeGateway();
  await expectError(
    gateway.callTool(MCP_WRITE, { fact: "x" }, {
      serviceToken: SVC,
      assertion: assertion({ kid: "kid-que-no-existe" }),
    }),
    401,
  );
});

test("jwksResolverFromDocument resuelve por kid y falla si falta", () => {
  const resolve = jwksResolverFromDocument(JWKS);
  assert.equal(resolve("test-key").kid, "test-key");
  assert.throws(() => resolve("otro"));
});

// ------------------------------------------------------------- §9.5 CLI

test("cliApplyAllowed: solo reversible+card con TTY", () => {
  assert.equal(cliApplyAllowed("reversible", "card", true), true);
  assert.equal(cliApplyAllowed("reversible", "card", false), false);
  assert.equal(cliApplyAllowed("reversible", "strong", true), false);
  assert.equal(cliApplyAllowed("irreversible", "strong", true), false);
  assert.equal(cliApplyAllowed("read", "none", true), false);
});

async function proposalViaCli(gateway) {
  const res = await gateway.callTool(MCP_WRITE, { fact: "x" }, { ...AUTH(), via: "cli" });
  return res.structuredContent.proposal_id;
}

test("CLI: apply con TTY ejecuta y audita via=cli/cli_tty", async () => {
  const { gateway, reversible, sink } = makeGateway();
  const pid = await proposalViaCli(gateway);
  const res = await gateway.callTool(SYS_APPLY, { proposal_id: pid }, {
    ...AUTH(), via: "cli", cliTtyConfirmed: true,
  });
  assert.ok(res.change_id);
  assert.equal(reversible.applied.length, 1);
  const applied = sink.events.find((e) => e.action === "applied");
  assert.equal(applied.via, "cli");
  assert.equal(applied.confirm_channel, "cli_tty");
});

test("CLI: apply sin TTY devuelve review_url sin ejecutar", async () => {
  const { gateway, reversible } = makeGateway();
  const pid = await proposalViaCli(gateway);
  const res = await gateway.callTool(SYS_APPLY, { proposal_id: pid }, { ...AUTH(), via: "cli" });
  assert.ok(res.review_url);
  assert.equal(reversible.applied.length, 0);
});

test("CLI: apply irreversible devuelve review_url aunque haya TTY", async () => {
  const { gateway, irreversible } = makeGateway();
  const res = await gateway.callTool(MCP_IRREVERSIBLE, { account: "acc-1" }, { ...AUTH(), via: "cli" });
  const out = await gateway.callTool(SYS_APPLY, { proposal_id: res.structuredContent.proposal_id }, {
    ...AUTH(), via: "cli", cliTtyConfirmed: true,
  });
  assert.ok(out.review_url);
  assert.equal(irreversible.applied.length, 0);
});

test("CLI: revert con TTY ejecuta; sin TTY devuelve review_url", async () => {
  const { gateway, reversible } = makeGateway();
  const pid = await proposalViaCli(gateway);
  const applied = await gateway.callTool(SYS_APPLY, { proposal_id: pid }, {
    ...AUTH(), via: "cli", cliTtyConfirmed: true,
  });
  const denied = await gateway.callTool(SYS_REVERT, { change_id: applied.change_id }, { ...AUTH(), via: "cli" });
  assert.ok(denied.review_url);
  const ok = await gateway.callTool(SYS_REVERT, { change_id: applied.change_id }, {
    ...AUTH(), via: "cli", cliTtyConfirmed: true,
  });
  assert.equal(ok.change.state, "reverted");
  assert.equal(reversible.reverted.length, 1);
});
