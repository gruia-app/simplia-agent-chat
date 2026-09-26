/** Batería de tokens §7 — misma semántica que servers/python. */

import assert from "node:assert/strict";
import test from "node:test";

import {
  AgentToolsService,
  hashToken,
  HttpEntitlementChecker,
  issueApplyToken,
  StubEntitlement,
} from "../dist/index.js";

import {
  accept,
  APP,
  apply,
  expectError,
  GRACE_SPEC,
  happyPath,
  makeEntitlement,
  makeService,
  ORG,
  OTHER_ORG,
  propose,
  USER,
} from "./helpers.mjs";

test("happy path: propose → accept → apply", async () => {
  const { service } = makeService();
  const { proposal, changeId } = await happyPath(service);
  const stored = await service.storage.getProposal(proposal.id);
  assert.equal(stored.state, "applied");
  assert.equal(stored.change_id, changeId);
});

test("double apply same token returns same change_id", async () => {
  const { service } = makeService();
  const p = await propose(service);
  const token = await accept(service, p.id);
  const first = await apply(service, p.id, token);
  const second = await apply(service, p.id, token);
  assert.equal(second.change_id, first.change_id);
});

test("concurrent applies: exactly one effect (CAS)", async () => {
  const { service, reversible } = makeService();
  const p = await propose(service);
  const token = await accept(service, p.id);
  const results = await Promise.allSettled([
    apply(service, p.id, token),
    apply(service, p.id, token),
  ]);
  const ok = results.filter((r) => r.status === "fulfilled").map((r) => r.value.change_id);
  const denied = results.filter((r) => r.status === "rejected" && r.reason.status === 403);
  // Un ganador + (idempotente 200 o 403) — nunca dos efectos.
  assert.equal(reversible.applied.length, 1);
  assert.ok(ok.length + denied.length === 2);
  assert.ok(new Set(ok).size <= 1);
});

test("CAS loser denied 403 (stale snapshot)", async () => {
  const { service, storage } = makeService();
  const p = await propose(service);
  const token = await accept(service, p.id);
  const tokenHash = hashToken(token);

  const realConsume = storage.consumeApplyToken.bind(storage);
  let first = true;
  storage.consumeApplyToken = (h, ts) => (first ? ((first = false), realConsume(h, ts)) : false);

  const ok = await apply(service, p.id, token);
  assert.ok(ok.change_id);

  const realGetToken = storage.getApplyToken.bind(storage);
  const realGetProposal = storage.getProposal.bind(storage);
  const tokenSnapshot = { ...(await storage.getApplyToken(tokenHash)), consumed_at: null };
  const proposalSnapshot = { ...(await storage.getProposal(p.id)), state: "accepted" };
  storage.getApplyToken = async (h) => (h === tokenHash ? { ...tokenSnapshot } : realGetToken(h));
  storage.getProposal = async (id) => (id === p.id ? { ...proposalSnapshot } : realGetProposal(id));

  await expectError(apply(service, p.id, token), 403, "token_already_used");
});

test("token bound to different payload_hash → 403", async () => {
  const { service, storage } = makeService();
  const p = await propose(service);
  const { token, row } = issueApplyToken({
    proposalId: p.id,
    payloadHash: "0".repeat(64),
    userId: USER,
    orgId: ORG,
    appKey: APP,
  });
  await storage.insertApplyToken(row);
  await expectError(apply(service, p.id, token), 403, "invalid_or_expired_token");
});

test("token bound to other org → 403", async () => {
  const { service, storage } = makeService();
  const p = await propose(service);
  const { token, row } = issueApplyToken({
    proposalId: p.id, payloadHash: p.payload_hash, userId: USER, orgId: OTHER_ORG, appKey: APP,
  });
  await storage.insertApplyToken(row);
  await expectError(apply(service, p.id, token), 403);
});

test("token bound to other app → 403", async () => {
  const { service, storage } = makeService();
  const p = await propose(service);
  const { token, row } = issueApplyToken({
    proposalId: p.id, payloadHash: p.payload_hash, userId: USER, orgId: ORG, appKey: "otra-app",
  });
  await storage.insertApplyToken(row);
  await expectError(apply(service, p.id, token), 403);
});

test("expired token → 403", async () => {
  const { service, storage } = makeService();
  const p = await propose(service);
  const past = new Date(Date.now() - 300_000).toISOString();
  const { token, row } = issueApplyToken({
    proposalId: p.id, payloadHash: p.payload_hash, userId: USER, orgId: ORG, appKey: APP,
    now: past, ttlS: 120,
  });
  await storage.insertApplyToken(row);
  await expectError(apply(service, p.id, token), 403, "invalid_or_expired_token");
});

test("token ttl capped at 120s", () => {
  assert.throws(() =>
    issueApplyToken({ proposalId: "p", payloadHash: "h", userId: "u", orgId: "o", appKey: "a", ttlS: 121 }),
  );
});

test("unknown token → 403", async () => {
  const { service } = makeService();
  const p = await propose(service);
  await expectError(apply(service, p.id, "tok_forged"), 403);
});

test("irreversible requires strong ack at accept and apply", async () => {
  const { service } = makeService();
  const p = await propose(service, { tool: "crm.borrar_cuenta", input: { account: "a-1" } });
  assert.equal(p.confirm_effective, "strong");
  await expectError(accept(service, p.id), 400, "ack_required");
  const token = await accept(service, p.id, { ack: "APLICAR" });
  await expectError(apply(service, p.id, token), 400, "ack_required");
  const result = await apply(service, p.id, token, { ack: "APLICAR" });
  assert.ok(result.change_id);
});

test("apply from model_context denied + audit denied_layer=token", async () => {
  const { service, sink } = makeService();
  const p = await propose(service);
  const token = await accept(service, p.id);
  await expectError(apply(service, p.id, token, { context: "model_context" }), 403);
  const denied = sink.events.filter((e) => e.action === "denied");
  assert.equal(denied.at(-1).denied_layer, "token");
});

test("accept from model_context denied", async () => {
  const { service } = makeService();
  const p = await propose(service);
  await expectError(accept(service, p.id, { context: "model_context" }), 403);
});

test("entitlement stub denies by default", async () => {
  const { service, registry, storage } = makeService({ entitlement: new StubEntitlement() });
  const p = await propose(service);
  await expectError(accept(service, p.id), 403);
  assert.equal((await storage.getProposal(p.id)).state, "proposed");
});

test("kernel down fails closed + audit denied_layer=entitlement", async () => {
  const { registry, storage, sink } = makeService();
  const checker = new HttpEntitlementChecker("http://kernel.invalid", "svc", async () => {
    throw new Error("unreachable");
  });
  const service = new AgentToolsService({ storage, registry, entitlement: checker, outboxSink: sink });
  const p = await propose(service);
  await expectError(accept(service, p.id), 403);
  const denied = sink.events.filter((e) => e.action === "denied");
  assert.equal(denied.at(-1).denied_layer, "entitlement");
});

test("tool outside tools_allow → 403 entitlement", async () => {
  const { registry, storage } = makeService();
  const service = new AgentToolsService({
    storage, registry,
    entitlement: makeEntitlement({ toolsAllow: ["memoria.recordar"] }),
  });
  const p = await propose(service, { tool: "crm.borrar_cuenta", input: { account: "a-1" } });
  await expectError(accept(service, p.id, { ack: "APLICAR" }), 403);
});

test("cost re-estimated upward → 409 cost_changed", async () => {
  const { registry, storage, reversible } = makeService();
  const service = new AgentToolsService({
    storage, registry, entitlement: makeEntitlement({ thresholdCredits: 10 }),
  });
  const p = await propose(service);
  assert.equal(p.confirm_effective, "card");
  const token = await accept(service, p.id);
  reversible.estimateCost = 50.0;
  await expectError(apply(service, p.id, token), 409, "cost_changed");
});

test("cost escalation at propose → confirm strong", async () => {
  const { registry, storage, reversible } = makeService();
  reversible.estimateCost = 50.0;
  const service = new AgentToolsService({
    storage, registry, entitlement: makeEntitlement({ thresholdCredits: 10 }),
  });
  const p = await propose(service);
  assert.equal(p.confirm_effective, "strong");
});
