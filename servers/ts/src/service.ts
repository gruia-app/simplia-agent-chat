/** AgentToolsService: las 10 rutas de §5 como métodos.
 *
 * §4 de principio a fin: validate → entitlement → role → policy → apply;
 * token un solo uso ligado a (proposal_id, payload_hash, user_id, org_id,
 * app_key), sha256 en servidor, comparación en tiempo constante,
 * TTL <= 120 s; idempotencia por proposal_id; concurrencia por CAS;
 * gracia en el servidor; outbox local en la misma transacción para
 * applied/reverted/compensated.
 *
 * El servicio nunca confía en claims del cliente: el actor y el contexto
 * llegan de la sesión autenticada del transporte.
 */

import { createHash, randomUUID } from "node:crypto";

import type { ToolSpec } from "@simplia/agent-chat-contract";

import {
  buildAuditEvent,
  OutboxDrainer,
  type AuditEvent,
  type AuditSink,
  type AuditVia,
  type ConfirmChannel,
  type CostUnit,
  type RouteInfo,
} from "./audit.js";
import { StubEntitlement, type EntitlementChecker } from "./entitlement.js";
import {
  badRequest,
  conflict,
  ContractError,
  forbidden,
  gone,
  notFound,
  unprocessable,
} from "./errors.js";
import type { ToolRegistry } from "./registry.js";
import type { ChangeRow, GraceJobRow, ProposalRow, Storage } from "./storage.js";
import {
  hashToken,
  isoNow,
  isoPlus,
  issueApplyToken,
  issueRevertToken,
  tokenMatches,
} from "./tokens.js";

export interface RoleChecker {
  decide(params: { orgId: string; userId: string; toolName: string; input: unknown }): Promise<boolean>;
}

export interface PolicyChecker {
  decide(params: {
    orgId: string;
    userId: string;
    toolspec: ToolSpec;
    preview: unknown;
    estimate: unknown;
  }): Promise<boolean>;
}

class AllowAll implements RoleChecker, PolicyChecker {
  async decide(): Promise<boolean> {
    return true;
  }
}

export type ActorContext = "user_confirmed" | "model_context";

export type { RouteInfo } from "./audit.js";

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((k) => [k, canonicalize((value as Record<string, unknown>)[k])]),
    );
  }
  return value;
}

export function payloadHashOf(input: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(input)), "utf8")
    .digest("hex");
}

function estimateCost(estimate: unknown): number | null {
  if (typeof estimate === "number") return estimate;
  if (estimate && typeof estimate === "object") {
    const e = estimate as Record<string, unknown>;
    for (const key of ["credits", "money_cents", "cost"]) {
      if (typeof e[key] === "number") return e[key] as number;
    }
  }
  return null;
}

function estimateUnit(estimate: unknown, costKind: string): CostUnit | null {
  if (costKind === "credits") return "credits";
  if (costKind === "money") return "money_cents";
  if (estimate && typeof estimate === "object") {
    const unit = (estimate as Record<string, unknown>).cost_unit;
    if (unit === "credits" || unit === "money_cents") return unit;
  }
  return null;
}

export interface AgentToolsServiceDeps {
  storage: Storage;
  registry: ToolRegistry;
  entitlement?: EntitlementChecker;
  role?: RoleChecker;
  policy?: PolicyChecker;
  outboxSink?: AuditSink;
}

export class AgentToolsService {
  readonly storage: Storage;
  readonly registry: ToolRegistry;
  readonly entitlement: EntitlementChecker;
  private readonly role: RoleChecker;
  private readonly policy: PolicyChecker;
  private readonly drainer: OutboxDrainer | null;

  constructor(deps: AgentToolsServiceDeps) {
    this.storage = deps.storage;
    this.registry = deps.registry;
    this.entitlement = deps.entitlement ?? new StubEntitlement(); // deniega por defecto (§4)
    this.role = deps.role ?? new AllowAll();
    this.policy = deps.policy ?? new AllowAll();
    this.drainer = deps.outboxSink ? new OutboxDrainer(deps.storage, deps.outboxSink) : null;
  }

  // ================================================================ §5

  /** GET /agent/tools — solo specs, sin previews ni inputs. */
  async listTools(): Promise<{ tools: ToolSpec[] }> {
    return { tools: this.registry.list() };
  }

  /** POST /agent/proposals → 201 {proposal}. */
  async createProposal(params: {
    tool: string;
    input: Record<string, unknown>;
    orgId: string;
    userId: string;
    threadId: string;
    planId?: string;
    step?: number;
    ttlS?: number;
    route?: RouteInfo | undefined;
    now?: string | undefined;
  }): Promise<{ proposal: ProposalRow }> {
    const nowIso = params.now ?? isoNow();
    const { spec, impl } = this.registry.get(params.tool);

    const inputErrors = this.registry.validateInput(params.tool, params.input);
    if (inputErrors.length > 0) {
      throw unprocessable(
        `invalid input: ${inputErrors[0]!.code} ${inputErrors[0]!.message}`,
        "invalid_input",
      );
    }

    const estimate = spec.cost.estimator ? impl.estimate(params.input) : null;
    const preview = impl.preview ? impl.preview(params.input) : null;

    // §2: card → strong si el coste estimado supera el umbral de la org.
    const confirmEffective = await this.escalatedConfirm(spec, estimate, params.orgId, params.userId);

    const proposal: ProposalRow = {
      id: randomUUID(),
      tool: params.tool,
      input: params.input,
      payload_hash: payloadHashOf(params.input),
      preview,
      estimate,
      confirm_effective: confirmEffective,
      state: "proposed",
      created_at: nowIso,
      expires_at: isoPlus(nowIso, params.ttlS ?? 300),
      supersedes: null,
      plan_id: params.planId ?? null,
      step: params.step ?? null,
      change_id: null,
      org_id: params.orgId,
      user_id: params.userId,
      thread_id: params.threadId,
    };
    await this.storage.insertProposal(proposal);
    await this.storage.insertOutboxEvents([
      this.event({ action: "proposed", result: "ok", userId: params.userId, proposal, ts: nowIso, route: params.route }),
    ]);
    await this.drain();
    return { proposal };
  }

  /** POST /agent/proposals/{id}/modify → 201 {proposal} (supersedes). */
  async modifyProposal(
    proposalId: string,
    params: { newInput: Record<string, unknown>; actorUserId: string; route?: RouteInfo | undefined; now?: string | undefined },
  ): Promise<{ proposal: ProposalRow }> {
    const nowIso = params.now ?? isoNow();
    const proposal = await this.requireProposal(proposalId);
    this.assertActor(proposal, params.actorUserId);
    await this.assertNotExpired(proposal, nowIso, params.route);

    if (!(await this.storage.casProposalState(proposalId, "proposed", { state: "discarded" }))) {
      if (proposal.state === "applied") {
        throw conflict("proposal already applied", "proposal_applied");
      }
      throw conflict("proposal not in proposed state", "invalid_transition");
    }
    await this.storage.insertOutboxEvents([
      this.event({ action: "discarded", result: "ok", userId: params.actorUserId, proposal, route: params.route }),
    ]);
    await this.drain();

    const { spec, impl } = this.registry.get(proposal.tool);
    const inputErrors = this.registry.validateInput(proposal.tool, params.newInput);
    if (inputErrors.length > 0) {
      throw unprocessable(`invalid input: ${inputErrors[0]!.code}`, "invalid_input");
    }
    const estimate = spec.cost.estimator ? impl.estimate(params.newInput) : null;
    const preview = impl.preview ? impl.preview(params.newInput) : null;
    const confirmEffective = await this.escalatedConfirm(spec, estimate, proposal.org_id, params.actorUserId);

    const next: ProposalRow = {
      id: randomUUID(),
      tool: proposal.tool,
      input: params.newInput,
      payload_hash: payloadHashOf(params.newInput),
      preview,
      estimate,
      confirm_effective: confirmEffective,
      state: "proposed",
      created_at: nowIso,
      expires_at: proposal.expires_at,
      supersedes: proposalId,
      plan_id: proposal.plan_id,
      step: proposal.step,
      change_id: null,
      org_id: proposal.org_id,
      user_id: proposal.user_id,
      thread_id: proposal.thread_id,
    };
    await this.storage.insertProposal(next);
    await this.storage.insertOutboxEvents([
      this.event({ action: "proposed", result: "ok", userId: params.actorUserId, proposal: next, route: params.route }),
    ]);
    await this.drain();
    return { proposal: next };
  }

  /** POST /agent/proposals/{id}/accept → 200 {apply_token}. */
  async acceptProposal(
    proposalId: string,
    params: { actorUserId: string; context: ActorContext; ack?: string | null; route?: RouteInfo | undefined; now?: string | undefined },
  ): Promise<{ apply_token: string; proposal_id: string }> {
    const nowIso = params.now ?? isoNow();
    const proposal = await this.requireProposal(proposalId);
    this.assertActor(proposal, params.actorUserId);
    const { spec } = this.registry.get(proposal.tool);

    if (params.context === "model_context") {
      await this.deny(proposal, params.actorUserId, "token", "model_context_apply", params.route);
      throw forbidden("model context cannot accept proposals", "model_context_apply");
    }
    await this.assertNotExpired(proposal, nowIso, params.route);
    if (proposal.state !== "proposed") {
      throw conflict("proposal not in proposed state", "invalid_transition");
    }
    // §4: la confirmación strong exige tip + ack del actor humano.
    if (proposal.confirm_effective === "strong" && !params.ack) {
      throw badRequest("strong confirmation requires an explicit ack", "ack_required");
    }
    await this.checkEntitlement(proposal, spec, params.actorUserId, params.route);
    if (!(await this.storage.casProposalState(proposalId, "proposed", { state: "accepted" }))) {
      throw conflict("proposal not in proposed state", "invalid_transition");
    }

    const { token, row } = issueApplyToken({
      proposalId,
      payloadHash: proposal.payload_hash,
      userId: params.actorUserId,
      orgId: proposal.org_id,
      appKey: spec.app_key,
      now: nowIso,
    });
    await this.storage.insertApplyToken(row);
    await this.storage.insertOutboxEvents([
      this.event({ action: "accepted", result: "ok", userId: params.actorUserId, proposal, route: params.route }),
    ]);
    await this.drain();
    return { apply_token: token, proposal_id: proposalId };
  }

  /** POST /agent/proposals/{id}/apply → 200 {proposal, change_id}. */
  async applyProposal(
    proposalId: string,
    params: { token: string; actorUserId: string; context: ActorContext; ack?: string | null; route?: RouteInfo | undefined; now?: string | undefined },
  ): Promise<{ proposal: ProposalRow; change_id: string | null; grace_until?: string }> {
    const nowIso = params.now ?? isoNow();
    const proposal = await this.requireProposal(proposalId);
    const { spec, impl } = this.registry.get(proposal.tool);

    if (params.context === "model_context") {
      await this.deny(proposal, params.actorUserId, "token", "model_context_apply", params.route);
      throw forbidden("model context cannot apply proposals", "model_context_apply");
    }

    const tokenHash = hashToken(params.token);
    const tokenRow = await this.storage.getApplyToken(tokenHash);

    // §4: aplicar dos veces con el mismo token devuelve el mismo change_id.
    if (tokenRow?.consumed_at) {
      const change = await this.storage.getChangeByProposal(proposalId);
      if (change && change.applied_token_hash === tokenHash) {
        return { proposal: (await this.requireProposal(proposalId)), change_id: change.change_id };
      }
      await this.deny(proposal, params.actorUserId, "token", "token_already_used", params.route);
      throw forbidden("apply token already used", "token_already_used");
    }

    if (proposal.confirm_effective === "strong" && !params.ack) {
      throw badRequest("strong confirmation requires an explicit ack", "ack_required");
    }
    await this.validateApplyToken(tokenRow, proposal, spec, params.actorUserId, nowIso, params.route);
    await this.checkEntitlement(proposal, spec, params.actorUserId, params.route);
    await this.checkRoleAndPolicy(proposal, spec, params.actorUserId, params.route);
    await this.checkCostReestimate(proposal, spec, impl.estimate.bind(impl));
    await this.assertNotExpired(proposal, nowIso, params.route);
    if (proposal.state !== "accepted") {
      throw conflict("proposal not in accepted state", "invalid_transition");
    }

    // CAS: solo una llamada consume el token (§4 concurrencia).
    if (!(await this.storage.consumeApplyToken(tokenHash, nowIso))) {
      await this.deny(proposal, params.actorUserId, "token", "token_already_used", params.route);
      throw forbidden("apply token already used", "token_already_used");
    }

    if (spec.undo.mode === "revert" && spec.undo.grace_s > 0) {
      // Gracia en el servidor: estado applied, efecto programado (§4).
      const job: GraceJobRow = {
        job_id: randomUUID(),
        proposal_id: proposalId,
        run_at: isoPlus(nowIso, spec.undo.grace_s),
        status: "pending",
        change_id: null,
        created_at: nowIso,
        route: params.route,
      };
      await this.storage.insertGraceJob(job);
      await this.storage.casProposalState(proposalId, "accepted", { state: "applied" });
      await this.drain();
      return {
        proposal: (await this.requireProposal(proposalId)),
        change_id: null,
        grace_until: job.run_at,
      };
    }

    return this.executeEffect(proposal, spec, impl, tokenHash, params.actorUserId, nowIso, params.route);
  }

  /** POST /agent/proposals/{id}/discard → 200. */
  async discardProposal(
    proposalId: string,
    params: { actorUserId: string; route?: RouteInfo | undefined; now?: string | undefined },
  ): Promise<{ proposal: ProposalRow; grace_cancelled?: boolean }> {
    const nowIso = params.now ?? isoNow();
    const proposal = await this.requireProposal(proposalId);
    this.assertActor(proposal, params.actorUserId);

    if (proposal.state === "proposed" || proposal.state === "accepted") {
      if (!(await this.storage.casProposalState(proposalId, proposal.state, { state: "discarded" }))) {
        throw conflict("proposal state changed", "invalid_transition");
      }
      await this.storage.insertOutboxEvents([
        this.event({ action: "discarded", result: "ok", userId: params.actorUserId, proposal, route: params.route }),
      ]);
      await this.drain();
      return { proposal: (await this.requireProposal(proposalId)) };
    }

    if (proposal.state === "applied") {
      const job = await this.storage.getGraceJobByProposal(proposalId);
      if (job && job.status === "pending" && job.run_at > nowIso) {
        if (!(await this.storage.casGraceJobStatus(job.job_id, "pending", { status: "cancelled" }))) {
          throw conflict("grace job already executed", "grace_expired");
        }
        await this.storage.casProposalState(proposalId, "applied", { state: "discarded" });
        await this.storage.insertOutboxEvents([
          this.event({ action: "discarded", result: "ok", userId: params.actorUserId, proposal, route: params.route }),
        ]);
        await this.drain();
        return { proposal: (await this.requireProposal(proposalId)), grace_cancelled: true };
      }
      throw gone("grace period expired", "grace_expired");
    }
    throw conflict("proposal cannot be discarded", "invalid_transition");
  }

  /** POST /agent/changes/{id}/revert-token → 200 {revert_token}. */
  async createRevertToken(
    changeId: string,
    params: { actorUserId: string; orgId: string; now?: string | undefined },
  ): Promise<{ revert_token: string }> {
    const nowIso = params.now ?? isoNow();
    const change = await this.requireChange(changeId);
    if (change.org_id !== params.orgId) {
      throw notFound("change not found", "change_not_found"); // §4 aislamiento
    }
    if (change.undo_mode !== "revert") {
      throw conflict("change is not revertible", "not_revertible");
    }
    if (change.state !== "applied") {
      throw conflict("change already undone", "invalid_transition");
    }
    this.assertUndoWindow(change, nowIso);
    const { token, row } = issueRevertToken({
      changeId,
      userId: params.actorUserId,
      orgId: params.orgId,
      now: nowIso,
    });
    await this.storage.insertRevertToken(row);
    return { revert_token: token };
  }

  /** POST /agent/changes/{id}/revert → 200. Solo dentro de undo.window_s. */
  async revertChange(
    changeId: string,
    params: { token: string; actorUserId: string; context: ActorContext; route?: RouteInfo | undefined; now?: string | undefined },
  ): Promise<{ change: ChangeRow }> {
    const nowIso = params.now ?? isoNow();
    const change = await this.requireChange(changeId);
    const { impl } = this.registry.get(change.tool);
    if (params.context === "model_context") {
      throw forbidden("model context cannot revert changes", "model_context_apply");
    }
    const tokenRow = await this.storage.getRevertToken(hashToken(params.token));
    if (
      !tokenRow ||
      tokenRow.change_id !== changeId ||
      tokenRow.user_id !== params.actorUserId ||
      tokenRow.org_id !== change.org_id ||
      tokenRow.consumed_at !== null ||
      tokenRow.expires_at <= nowIso
    ) {
      throw forbidden("invalid or expired revert token", "invalid_or_expired_token");
    }
    this.assertUndoWindow(change, nowIso);
    if (!(await this.storage.consumeRevertToken(tokenRow.token_hash, nowIso))) {
      throw forbidden("revert token already used", "token_already_used");
    }
    await impl.revert(changeId);
    await this.storage.updateChangeState(
      changeId,
      { state: "reverted", undone_at: nowIso },
      [this.event({ action: "reverted", result: "ok", userId: params.actorUserId, change, ts: nowIso, route: params.route })],
    );
    await this.drain();
    return { change: (await this.requireChange(changeId)) };
  }

  /** POST /agent/changes/{id}/compensate → 200. Permitido tras la ventana. */
  async compensateChange(
    changeId: string,
    params: { actorUserId: string; context: ActorContext; route?: RouteInfo | undefined; now?: string | undefined },
  ): Promise<{ change: ChangeRow }> {
    const nowIso = params.now ?? isoNow();
    const change = await this.requireChange(changeId);
    const { impl } = this.registry.get(change.tool);
    if (params.context === "model_context") {
      throw forbidden("model context cannot compensate changes", "model_context_apply");
    }
    if (change.undo_mode !== "compensate") {
      throw conflict("change is not compensable", "not_compensable");
    }
    if (change.state !== "applied") {
      throw conflict("change already undone", "invalid_transition");
    }
    await impl.compensate(changeId);
    await this.storage.updateChangeState(
      changeId,
      { state: "compensated", undone_at: nowIso },
      [this.event({ action: "compensated", result: "ok", userId: params.actorUserId, change, ts: nowIso, route: params.route })],
    );
    await this.drain();
    return { change: (await this.requireChange(changeId)) };
  }

  /** GET /agent/proposals?thread_id= — aisladas por org (§4). */
  async listProposals(params: { threadId: string; orgId: string }): Promise<{ proposals: ProposalRow[] }> {
    const all = await this.storage.listProposals(params.threadId);
    return { proposals: all.filter((p) => p.org_id === params.orgId) };
  }

  // ============================================================ gracia

  /** Ejecuta los efectos programados cuya gracia expiró. */
  async runDueGraceJobs(params?: { now?: string | undefined }): Promise<number> {
    const nowIso = params?.now ?? isoNow();
    let ran = 0;
    for (const job of await this.storage.dueGraceJobs(nowIso)) {
      if (!(await this.storage.casGraceJobStatus(job.job_id, "pending", { status: "running" }))) {
        continue;
      }
      const proposal = await this.requireProposal(job.proposal_id);
      const { spec, impl } = this.registry.get(proposal.tool);
      const result = await this.executeEffect(proposal, spec, impl, null, proposal.user_id, nowIso, job.route as RouteInfo | undefined);
      await this.storage.casGraceJobStatus(job.job_id, "running", {
        status: "done",
        change_id: result.change_id,
      });
      ran += 1;
    }
    return ran;
  }

  // ========================================================== internos

  private async escalatedConfirm(
    spec: ToolSpec,
    estimate: unknown,
    orgId: string,
    userId: string,
  ): Promise<string> {
    if (spec.confirm !== "card") return spec.confirm;
    const decision = await this.entitlement.decide({
      orgId, appKey: spec.app_key, userId, toolName: spec.name, effect: spec.effect,
    });
    const threshold = decision.entitlement?.cost_threshold;
    const cost = estimateCost(estimate);
    if (!threshold || cost === null) return spec.confirm;
    const cap = spec.cost.kind === "credits" ? threshold.credits : threshold.money_cents;
    return cap != null && cost > cap ? "strong" : spec.confirm;
  }

  private async executeEffect(
    proposal: ProposalRow,
    spec: ToolSpec,
    impl: { apply: (i: Record<string, unknown>, k: string) => string | Promise<string> },
    appliedTokenHash: string | null,
    actorUserId: string,
    nowIso: string,
    route?: RouteInfo,
  ): Promise<{ proposal: ProposalRow; change_id: string }> {
    const changeId = await impl.apply(proposal.input as Record<string, unknown>, proposal.id);
    if (!changeId) {
      throw new ContractError("apply_failed", "apply returned no change_id", 500);
    }
    const unit = estimateUnit(proposal.estimate, spec.cost.kind);
    const cost = unit ? estimateCost(proposal.estimate) : null;
    const change: ChangeRow = {
      change_id: changeId,
      proposal_id: proposal.id,
      tool: proposal.tool,
      app_key: spec.app_key,
      org_id: proposal.org_id,
      user_id: proposal.user_id,
      payload_hash: proposal.payload_hash,
      applied_at: nowIso,
      state: "applied",
      undo_mode: spec.undo.mode,
      undo_window_s: spec.undo.window_s,
      undone_at: null,
      cost_actual: cost,
      cost_unit: unit,
      applied_token_hash: appliedTokenHash,
    };
    // §6: change + outbox en la MISMA transacción.
    const inserted = await this.storage.insertChange(change, [
      this.event({ action: "applied", result: "ok", userId: actorUserId, proposal, change, ts: nowIso, route }),
    ]);
    if (!inserted) {
      const existing = (await this.storage.getChangeByProposal(proposal.id))!;
      return { proposal: (await this.requireProposal(proposal.id)), change_id: existing.change_id };
    }
    await this.storage.casProposalState(proposal.id, proposal.state, {
      state: "applied",
      change_id: changeId,
    });
    await this.drain();
    return { proposal: (await this.requireProposal(proposal.id)), change_id: changeId };
  }

  private async validateApplyToken(
    row: Awaited<ReturnType<Storage["getApplyToken"]>>,
    proposal: ProposalRow,
    spec: ToolSpec,
    actorUserId: string,
    nowIso: string,
    route?: RouteInfo,
  ): Promise<void> {
    const ok =
      row !== null &&
      row.proposal_id === proposal.id &&
      tokenMatches(row as unknown as Record<string, unknown>, "payload_hash", proposal.payload_hash) &&
      tokenMatches(row as unknown as Record<string, unknown>, "user_id", actorUserId) &&
      tokenMatches(row as unknown as Record<string, unknown>, "org_id", proposal.org_id) &&
      tokenMatches(row as unknown as Record<string, unknown>, "app_key", spec.app_key) &&
      row.expires_at > nowIso;
    if (!ok) {
      await this.deny(proposal, actorUserId, "token", "invalid_or_expired_token", route);
      throw forbidden("invalid or expired apply token", "invalid_or_expired_token");
    }
  }

  private async checkEntitlement(proposal: ProposalRow, spec: ToolSpec, actorUserId: string, route?: RouteInfo): Promise<void> {
    const decision = await this.entitlement.decide({
      orgId: proposal.org_id,
      appKey: spec.app_key,
      userId: actorUserId,
      toolName: proposal.tool,
      effect: spec.effect,
    });
    if (!decision.allowed) {
      await this.deny(proposal, actorUserId, "entitlement", decision.reason ?? "denied", route);
      throw forbidden(decision.reason ?? "denied by entitlement", decision.reason ?? "entitlement_denied");
    }
  }

  private async checkRoleAndPolicy(proposal: ProposalRow, spec: ToolSpec, actorUserId: string, route?: RouteInfo): Promise<void> {
    if (
      !(await this.role.decide({
        orgId: proposal.org_id,
        userId: actorUserId,
        toolName: proposal.tool,
        input: proposal.input,
      }))
    ) {
      await this.deny(proposal, actorUserId, "role", "role_denied", route);
      throw forbidden("denied by role", "role_denied");
    }
    if (
      !(await this.policy.decide({
        orgId: proposal.org_id,
        userId: actorUserId,
        toolspec: spec,
        preview: proposal.preview,
        estimate: proposal.estimate,
      }))
    ) {
      await this.deny(proposal, actorUserId, "policy", "policy_denied", route);
      throw forbidden("denied by policy", "policy_denied");
    }
  }

  private async checkCostReestimate(
    proposal: ProposalRow,
    spec: ToolSpec,
    estimate: (input: Record<string, unknown>) => unknown,
  ): Promise<void> {
    if (!spec.cost.estimator) return;
    const newEstimate = estimate(proposal.input as Record<string, unknown>);
    const oldCost = estimateCost(proposal.estimate);
    const newCost = estimateCost(newEstimate);
    if (newCost === null || oldCost === null || newCost <= oldCost) return;
    const decision = await this.entitlement.decide({
      orgId: proposal.org_id,
      appKey: spec.app_key,
      userId: proposal.user_id,
      toolName: proposal.tool,
      effect: spec.effect,
    });
    const threshold = decision.entitlement?.cost_threshold;
    const cap = threshold
      ? spec.cost.kind === "credits"
        ? threshold.credits
        : threshold.money_cents
      : null;
    const escalates = cap != null && oldCost <= cap && cap < newCost;
    if (escalates || proposal.confirm_effective !== spec.confirm) {
      throw conflict("cost estimate increased; confirmation must be renewed", "cost_changed");
    }
  }

  private assertUndoWindow(change: ChangeRow, nowIso: string): void {
    const deadline = Date.parse(change.applied_at) + change.undo_window_s * 1000;
    if (Date.parse(nowIso) > deadline) {
      throw gone("undo window expired", "undo_window_expired");
    }
  }

  private async assertNotExpired(proposal: ProposalRow, nowIso: string, route?: RouteInfo): Promise<void> {
    if (proposal.expires_at <= nowIso) {
      await this.storage.casProposalState(proposal.id, proposal.state, { state: "expired" });
      await this.storage.insertOutboxEvents([
        this.event({ action: "expired", result: "ok", userId: proposal.user_id, proposal, route }),
      ]);
      await this.drain();
      throw gone("proposal expired", "proposal_expired");
    }
  }

  private async requireProposal(id: string): Promise<ProposalRow> {
    const proposal = await this.storage.getProposal(id);
    if (!proposal) throw notFound("proposal not found", "proposal_not_found");
    return proposal;
  }

  private async requireChange(id: string): Promise<ChangeRow> {
    const change = await this.storage.getChange(id);
    if (!change) throw notFound("change not found", "change_not_found");
    return change;
  }

  private assertActor(proposal: ProposalRow, actorUserId: string): void {
    if (proposal.user_id !== actorUserId) {
      throw forbidden("actor does not own this proposal", "forbidden");
    }
  }

  private event(params: {
    action: AuditEvent["action"];
    result: "ok" | "error";
    userId: string;
    proposal?: ProposalRow;
    change?: ChangeRow;
    ts?: string;
    deniedLayer?: "entitlement" | "role" | "policy" | "token" | null;
    errorCode?: string | null;
    route?: RouteInfo | undefined;
  }): AuditEvent {
    const base = params.proposal;
    const ch = params.change;
    const toolName = base?.tool ?? ch!.tool;
    const spec = this.registry.get(toolName).spec;
    const unit: CostUnit =
      (ch?.cost_unit as CostUnit | null) ??
      estimateUnit(base?.estimate, spec.cost.kind) ??
      "credits";
    return buildAuditEvent({
      ts: params.ts ?? isoNow(),
      org_id: base?.org_id ?? ch!.org_id,
      app_key: ch?.app_key ?? spec.app_key,
      user_id: params.userId,
      tool: toolName,
      proposal_id: base?.id ?? ch!.proposal_id,
      change_id: ch?.change_id ?? base?.change_id ?? null,
      payload_hash: base?.payload_hash ?? ch!.payload_hash,
      action: params.action,
      via: params.route?.via ?? "ui",
      client_id: params.route?.client_id ?? null,
      client_verified: params.route?.client_verified ?? null,
      confirm_channel: params.route?.confirm_channel ?? null,
      confirm_effective: base?.confirm_effective ?? "none",
      denied_layer: params.deniedLayer ?? null,
      cost_estimate: estimateCost(base?.estimate) ?? 0.0,
      cost_actual: ch?.cost_actual ?? null,
      cost_unit: unit,
      result: params.result,
      error_code: params.errorCode ?? null,
    });
  }

  private async deny(
    proposal: ProposalRow,
    userId: string,
    layer: "entitlement" | "role" | "policy" | "token",
    code: string,
    route?: RouteInfo,
  ): Promise<void> {
    await this.storage.insertOutboxEvents([
      this.event({
        action: "denied",
        result: "error",
        userId,
        proposal,
        deniedLayer: layer,
        errorCode: code,
        route,
      }),
    ]);
    await this.drain();
  }

  private async drain(): Promise<void> {
    if (!this.drainer) return;
    try {
      await this.drainer.drain(isoNow());
    } catch {
      // §6: sink caído → eventos quedan en outbox; la operación no falla.
    }
  }
}
