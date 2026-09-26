/** §3 ciclo de vida, §4 gracia/revert, §6 auditoría y outbox. */

import assert from "node:assert/strict";
import test from "node:test";

import {
  AgentToolsService,
  AUDIT_FIELDS,
  JsonLinesSink,
  OutboxDrainer,
} from "../dist/index.js";
import { validateContractDocument } from "@simplia/agent-chat-contract";

import {
  accept,
  apply,
  expectError,
  happyPath,
  makeService,
  ORG,
  propose,
  USER,
} from "./helpers.mjs";

const future = (s) => new Date(Date.now() + s * 1000).toISOString();
const past = (s) => new Date(Date.now() - s * 1000).toISOString();

// ---------------------------------------------------------------- ciclo §3

test("modify creates superseding proposal, old discarded", async () => {
  const { service } = makeService();
  const p = await propose(service);
  const { proposal: next } = await service.modifyProposal(p.id, {
    newInput: { fact: "otro" }, actorUserId: USER,
  });
  assert.equal(next.supersedes, p.id);
  assert.equal(next.state, "proposed");
  assert.equal((await service.storage.getProposal(p.id)).state, "discarded");
});

test("discard proposed → discarded", async () => {
  const { service } = makeService();
  const p = await propose(service);
  const { proposal } = await service.discardProposal(p.id, { actorUserId: USER });
  assert.equal(proposal.state, "discarded");
});

test("invalid transition → 409", async () => {
  const { service } = makeService();
  const { proposal } = await happyPath(service);
  await expectError(accept(service, proposal.id), 409);
});

test("expired proposal → 410 + state expired", async () => {
  const { service } = makeService();
  const p = await propose(service, { now: past(600) });
  await expectError(accept(service, p.id), 410);
  assert.equal((await service.storage.getProposal(p.id)).state, "expired");
});

test("actor other user → 403", async () => {
  const { service } = makeService();
  const p = await propose(service);
  await expectError(accept(service, p.id, { user: "user-2" }), 403);
});

test("list proposals isolated by org", async () => {
  const { service } = makeService();
  await propose(service);
  await propose(service, { org: "org-2" });
  const { proposals } = await service.listProposals({ threadId: "thread-1", orgId: ORG });
  assert.equal(proposals.length, 1);
  assert.ok(proposals.every((p) => p.org_id === ORG));
});

// ----------------------------------------------------------------- gracia

test("grace: discard inside grace cancels the effect", async () => {
  const { service, reversible } = makeService();
  const p = await propose(service, { tool: "memoria.gracia" });
  const token = await accept(service, p.id);
  const result = await apply(service, p.id, token);
  assert.equal(result.proposal.state, "applied");
  assert.equal(result.change_id, null); // efecto aún no ejecutado
  assert.equal(reversible.applied.length, 0);

  const out = await service.discardProposal(p.id, { actorUserId: USER });
  assert.equal(out.grace_cancelled, true);
  assert.equal(out.proposal.state, "discarded");
  await service.runDueGraceJobs({ now: future(120) });
  assert.equal(reversible.applied.length, 0);
});

test("grace job applies effect at expiry; discard after → 410", async () => {
  const { service, reversible } = makeService();
  const p = await propose(service, { tool: "memoria.gracia" });
  const token = await accept(service, p.id);
  await apply(service, p.id, token);
  const ran = await service.runDueGraceJobs({ now: future(61) });
  assert.equal(ran, 1);
  assert.equal(reversible.applied.length, 1);
  assert.ok(await service.storage.getChangeByProposal(p.id));
  await expectError(
    service.discardProposal(p.id, { actorUserId: USER, now: future(61) }), 410,
  );
});

// ----------------------------------------------------------------- revert

test("revert token + revert → change reverted + audit", async () => {
  const { service, reversible, sink } = makeService();
  const { changeId } = await happyPath(service);
  const { revert_token } = await service.createRevertToken(changeId, { actorUserId: USER, orgId: ORG });
  const { change } = await service.revertChange(changeId, {
    token: revert_token, actorUserId: USER, context: "user_confirmed",
  });
  assert.equal(change.state, "reverted");
  assert.deepEqual(reversible.reverted, [changeId]);
  assert.ok(sink.events.some((e) => e.action === "reverted"));
});

test("revert outside undo window → 410", async () => {
  const { service } = makeService();
  const { changeId } = await happyPath(service);
  await expectError(
    service.createRevertToken(changeId, { actorUserId: USER, orgId: ORG, now: future(301) }), 410,
  );
});

test("revert token for other org → 404 (isolation)", async () => {
  const { service } = makeService();
  const { changeId } = await happyPath(service);
  await expectError(
    service.createRevertToken(changeId, { actorUserId: USER, orgId: "org-2" }), 404,
  );
});

test("compensate allowed after undo window", async () => {
  const { service, irreversible } = makeService();
  const p = await propose(service, { tool: "crm.borrar_cuenta", input: { account: "a-1" } });
  const token = await accept(service, p.id, { ack: "APLICAR" });
  const { change_id } = await apply(service, p.id, token, { ack: "APLICAR" });
  const { change } = await service.compensateChange(change_id, {
    actorUserId: USER, context: "user_confirmed", now: future(30 * 24 * 3600),
  });
  assert.equal(change.state, "compensated");
  assert.deepEqual(irreversible.compensated, [change_id]);
});

// ----------------------------------------------------------------- §6 audit

test("audit events: exact §6 fields + schema valid", async () => {
  const { service, sink } = makeService();
  await happyPath(service);
  assert.ok(sink.events.length >= 3);
  assert.deepEqual(
    sink.events.slice(0, 3).map((e) => e.action),
    ["proposed", "accepted", "applied"],
  );
  for (const event of sink.events) {
    assert.deepEqual(new Set(Object.keys(event)), new Set(AUDIT_FIELDS));
    assert.deepEqual(validateContractDocument("audit-event", event), []);
  }
});

test("denied audit event has denied_layer + error", async () => {
  const { service, sink } = makeService();
  const p = await propose(service);
  await expectError(accept(service, p.id, { context: "model_context" }), 403);
  const denied = sink.events.filter((e) => e.action === "denied");
  assert.equal(denied.length, 1);
  assert.equal(denied[0].denied_layer, "token");
  assert.equal(denied[0].result, "error");
  assert.deepEqual(validateContractDocument("audit-event", denied[0]), []);
});

test("applied event lands in outbox in the same transaction", async () => {
  const { registry, storage } = makeService();
  const service = new AgentToolsService({
    storage, registry, entitlement: (await import("./helpers.mjs")).makeEntitlement(),
  });
  const { proposal } = await happyPath(service);
  assert.ok(await storage.getChangeByProposal(proposal.id));
  const pending = await storage.undeliveredOutbox(10);
  assert.ok(pending.some((r) => r.payload.action === "applied"));
});

test("outbox survives sink down; drains when it recovers", async () => {
  const { registry, storage } = makeService();
  const downSink = { deliver: async () => { throw new Error("sink down"); } };
  const service = new AgentToolsService({
    storage, registry,
    entitlement: (await import("./helpers.mjs")).makeEntitlement(),
    outboxSink: downSink,
  });
  await happyPath(service);
  const pending = await storage.undeliveredOutbox(10);
  assert.equal(pending.length, 3);
  assert.deepEqual(
    new Set(pending.map((r) => r.payload.action)),
    new Set(["proposed", "accepted", "applied"]),
  );

  const sink = new JsonLinesSink();
  const drainer = new OutboxDrainer(storage, sink);
  assert.equal(await drainer.drain(new Date().toISOString()), 3);
  assert.equal((await storage.undeliveredOutbox(10)).length, 0);
  assert.equal(sink.events.length, 3);
});

test("outbox dedup by event_id", async () => {
  const { storage } = makeService();
  const event = { event_id: "evt-dup-1", ts: "2026-09-24T12:00:00.000Z" };
  assert.equal(await storage.insertOutboxEvents([event]), 1);
  assert.equal(await storage.insertOutboxEvents([event]), 0);
  assert.equal((await storage.undeliveredOutbox(10)).length, 1);
});
