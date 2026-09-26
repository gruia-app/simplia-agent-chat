import {
  AgentToolsService,
  JsonLinesSink,
  MemoryStorage,
  StubEntitlement,
  ToolRegistry,
} from "../dist/index.js";

export const ORG = "org-1";
export const OTHER_ORG = "org-2";
export const APP = "insaidr";
export const USER = "user-1";
export const THREAD = "thread-1";

export const REVERSIBLE_SPEC = {
  name: "memoria.recordar",
  description: "Guarda un hecho en la memoria de la organizacion",
  input_schema: {
    type: "object",
    properties: { fact: { type: "string", minLength: 1 } },
    required: ["fact"],
    additionalProperties: false,
  },
  effect: "reversible",
  cost: { kind: "credits", estimator: true },
  confirm: "card",
  undo: { mode: "revert", window_s: 300, grace_s: 0 },
  app_key: APP,
};

export const IRREVERSIBLE_SPEC = {
  name: "crm.borrar_cuenta",
  description: "Borra definitivamente la cuenta del CRM",
  input_schema: {
    type: "object",
    properties: { account: { type: "string" } },
    required: ["account"],
    additionalProperties: false,
  },
  effect: "irreversible",
  cost: { kind: "none", estimator: false },
  confirm: "strong",
  undo: { mode: "compensate", window_s: 0, grace_s: 0 },
  app_key: APP,
};

export const GRACE_SPEC = {
  name: "memoria.gracia",
  description: "Hecho con gracia de 60 segundos",
  input_schema: {
    type: "object",
    properties: { fact: { type: "string" } },
    required: ["fact"],
  },
  effect: "reversible",
  cost: { kind: "none", estimator: false },
  confirm: "card",
  undo: { mode: "revert", window_s: 300, grace_s: 60 },
  app_key: APP,
};

export class FakeTool {
  constructor(estimateCost = 5.0) {
    this.estimateCost = estimateCost;
    this.applied = [];
    this.reverted = [];
    this.compensated = [];
    this.counter = 0;
  }
  estimate() {
    return { credits: this.estimateCost, cost_unit: "credits" };
  }
  preview(input) {
    return { ops: [{ op: "add", path: "/fact", value: input }] };
  }
  apply(input, idempotencyKey) {
    const found = this.applied.find((e) => e.idempotencyKey === idempotencyKey);
    if (found) return found.changeId;
    this.counter += 1;
    const changeId = `chg-${String(this.counter).padStart(4, "0")}`;
    this.applied.push({ changeId, idempotencyKey, input });
    return changeId;
  }
  revert(changeId) {
    this.reverted.push(changeId);
  }
  compensate(changeId) {
    this.compensated.push(changeId);
  }
}

export function makeEntitlement({ allow = true, thresholdCredits = null, toolsAllow = null, maxEffect = "irreversible" } = {}) {
  const row = {
    enabled: allow,
    tools_allow: toolsAllow ?? ["memoria.recordar", "memoria.gracia", "crm.borrar_cuenta"],
    max_effect: maxEffect,
    cost_threshold: thresholdCredits !== null ? { credits: thresholdCredits } : {},
  };
  return new StubEntitlement(allow, { [`${ORG}/${APP}`]: row });
}

export function makeService({ entitlement, sink } = {}) {
  const storage = new MemoryStorage();
  const registry = new ToolRegistry();
  const reversible = new FakeTool();
  const irreversible = new FakeTool();
  registry.register(REVERSIBLE_SPEC, reversible);
  registry.register(IRREVERSIBLE_SPEC, irreversible);
  registry.register(GRACE_SPEC, reversible);
  const jsonSink = sink ?? new JsonLinesSink();
  const service = new AgentToolsService({
    storage,
    registry,
    entitlement: entitlement ?? makeEntitlement(),
    outboxSink: jsonSink,
  });
  return { service, storage, registry, sink: jsonSink, reversible, irreversible };
}

export function propose(service, { tool = "memoria.recordar", input = null, org = ORG, user = USER, ...kw } = {}) {
  return service
    .createProposal({
      tool,
      input: input ?? { fact: "dato" },
      orgId: org,
      userId: user,
      threadId: THREAD,
      ...kw,
    })
    .then((r) => r.proposal);
}

export function accept(service, proposalId, { user = USER, context = "user_confirmed", ack = null, ...kw } = {}) {
  return service
    .acceptProposal(proposalId, { actorUserId: user, context, ack, ...kw })
    .then((r) => r.apply_token);
}

export function apply(service, proposalId, token, { user = USER, context = "user_confirmed", ack = null, ...kw } = {}) {
  return service.applyProposal(proposalId, { token, actorUserId: user, context, ack, ...kw });
}

export async function happyPath(service, { ack = null } = {}) {
  const p = await propose(service);
  const token = await accept(service, p.id, { ack });
  const result = await apply(service, p.id, token, { ack });
  return { proposal: p, changeId: result.change_id };
}

export async function expectError(promise, status, code) {
  try {
    await promise;
  } catch (error) {
    if (status !== undefined) assert.equal(error.status, status, `expected status ${status}, got ${error.status} (${error.code})`);
    if (code !== undefined) assert.equal(error.code, code);
    return error;
  }
  assert.fail(`expected ContractError ${status} ${code ?? ""}`);
}

import assert from "node:assert/strict";
