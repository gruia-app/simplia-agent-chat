/** Interfaz de almacenamiento (§1) + implementación de referencia en
 * memoria para tests/dev. Toda mutación de estado expone CAS (§4).
 *
 * En producción la app implementa esta misma interfaz sobre SQL: las
 * operaciones CAS se traducen a UPDATE ... WHERE id=? AND state=? y el
 * insert de change+outbox va en una única transacción (§6).
 */

import type { AuditEvent, RouteInfo } from "./audit.js";
import type { ApplyTokenRow, RevertTokenRow } from "./tokens.js";

export interface ProposalRow {
  id: string;
  tool: string;
  input: unknown;
  payload_hash: string;
  preview: unknown;
  estimate: unknown;
  confirm_effective: string;
  state: string;
  created_at: string;
  expires_at: string;
  supersedes: string | null;
  plan_id: string | null;
  step: number | null;
  change_id: string | null;
  org_id: string;
  user_id: string;
  thread_id: string;
}

export interface ChangeRow {
  change_id: string;
  proposal_id: string;
  tool: string;
  app_key: string;
  org_id: string;
  user_id: string;
  payload_hash: string;
  applied_at: string;
  state: string;
  undo_mode: string;
  undo_window_s: number;
  undone_at: string | null;
  cost_actual: number | null;
  cost_unit: string | null;
  applied_token_hash: string | null;
}

export interface GraceJobRow {
  job_id: string;
  proposal_id: string;
  run_at: string;
  status: string;
  change_id: string | null;
  created_at: string;
  /** Canal de la acción original, para el evento applied diferido (§6 rev4). */
  route?: RouteInfo | undefined;
}

export interface OutboxRow {
  event_id: string;
  payload: AuditEvent;
  created_at: string;
  delivered_at: string | null;
}

export interface Storage {
  insertProposal(p: ProposalRow): Promise<void>;
  getProposal(id: string): Promise<ProposalRow | null>;
  listProposals(threadId: string): Promise<ProposalRow[]>;
  /** UPDATE ... WHERE id AND state — true si ganó el CAS. */
  casProposalState(id: string, fromState: string, updates: Partial<ProposalRow>): Promise<boolean>;

  insertApplyToken(t: ApplyTokenRow): Promise<void>;
  getApplyToken(tokenHash: string): Promise<ApplyTokenRow | null>;
  /** CAS: consumed_at solo si era NULL. */
  consumeApplyToken(tokenHash: string, consumedAt: string): Promise<boolean>;

  insertRevertToken(t: RevertTokenRow): Promise<void>;
  getRevertToken(tokenHash: string): Promise<RevertTokenRow | null>;
  consumeRevertToken(tokenHash: string, consumedAt: string): Promise<boolean>;

  getChange(changeId: string): Promise<ChangeRow | null>;
  getChangeByProposal(proposalId: string): Promise<ChangeRow | null>;
  /** change + outbox en la MISMA transacción (§6); false si ya existía. */
  insertChange(change: ChangeRow, outboxEvents: AuditEvent[]): Promise<boolean>;
  updateChangeState(changeId: string, updates: Partial<ChangeRow>, outboxEvents: AuditEvent[]): Promise<boolean>;

  insertGraceJob(job: GraceJobRow): Promise<void>;
  dueGraceJobs(nowIso: string): Promise<GraceJobRow[]>;
  casGraceJobStatus(jobId: string, fromStatus: string, updates: Partial<GraceJobRow>): Promise<boolean>;
  getGraceJobByProposal(proposalId: string): Promise<GraceJobRow | null>;

  // -- jti del gateway (§9.4) --

  /** Registra un jti de aserción usado. False si ya existía (replay → 401). */
  insertGatewayJti(jti: string, expiresAt: string): Promise<boolean>;
  /** Borra jti expirados; solo hay que conservarlos durante su exp. */
  purgeGatewayJtis(nowIso: string): Promise<number>;

  // -- audit outbox (§6) --

  /** Idempotente por event_id; devuelve cuántos se insertaron. */
  insertOutboxEvents(events: AuditEvent[]): Promise<number>;
  undeliveredOutbox(limit: number): Promise<OutboxRow[]>;
  markOutboxDelivered(eventIds: string[], deliveredAt: string): Promise<void>;
}

/** Referencia en memoria. Las operaciones son síncronas en el event loop,
 * por lo que cada CAS es atómico respecto a otras llamadas del proceso. */
export class MemoryStorage implements Storage {
  private readonly proposals = new Map<string, ProposalRow>();
  private readonly applyTokens = new Map<string, ApplyTokenRow>();
  private readonly revertTokens = new Map<string, RevertTokenRow>();
  private readonly changes = new Map<string, ChangeRow>();
  private readonly graceJobs = new Map<string, GraceJobRow>();
  private readonly outbox = new Map<string, OutboxRow>();
  private readonly gatewayJtis = new Map<string, string>();

  async insertProposal(p: ProposalRow): Promise<void> {
    this.proposals.set(p.id, structuredClone(p));
  }

  async getProposal(id: string): Promise<ProposalRow | null> {
    const row = this.proposals.get(id);
    return row ? structuredClone(row) : null;
  }

  async listProposals(threadId: string): Promise<ProposalRow[]> {
    return [...this.proposals.values()]
      .filter((p) => p.thread_id === threadId)
      .sort((a, b) => (a.created_at + a.id).localeCompare(b.created_at + b.id))
      .map((p) => structuredClone(p));
  }

  async casProposalState(id: string, fromState: string, updates: Partial<ProposalRow>): Promise<boolean> {
    const row = this.proposals.get(id);
    if (!row || row.state !== fromState) return false;
    Object.assign(row, updates);
    return true;
  }

  async insertApplyToken(t: ApplyTokenRow): Promise<void> {
    this.applyTokens.set(t.token_hash, { ...t });
  }

  async getApplyToken(tokenHash: string): Promise<ApplyTokenRow | null> {
    const row = this.applyTokens.get(tokenHash);
    return row ? { ...row } : null;
  }

  async consumeApplyToken(tokenHash: string, consumedAt: string): Promise<boolean> {
    const row = this.applyTokens.get(tokenHash);
    if (!row || row.consumed_at !== null) return false;
    row.consumed_at = consumedAt;
    return true;
  }

  async insertRevertToken(t: RevertTokenRow): Promise<void> {
    this.revertTokens.set(t.token_hash, { ...t });
  }

  async getRevertToken(tokenHash: string): Promise<RevertTokenRow | null> {
    const row = this.revertTokens.get(tokenHash);
    return row ? { ...row } : null;
  }

  async consumeRevertToken(tokenHash: string, consumedAt: string): Promise<boolean> {
    const row = this.revertTokens.get(tokenHash);
    if (!row || row.consumed_at !== null) return false;
    row.consumed_at = consumedAt;
    return true;
  }

  async getChange(changeId: string): Promise<ChangeRow | null> {
    const row = this.changes.get(changeId);
    return row ? { ...row } : null;
  }

  async getChangeByProposal(proposalId: string): Promise<ChangeRow | null> {
    const row = [...this.changes.values()].find((c) => c.proposal_id === proposalId);
    return row ? { ...row } : null;
  }

  async insertChange(change: ChangeRow, outboxEvents: AuditEvent[]): Promise<boolean> {
    // Misma "transacción": primero la guarda, luego el efecto+outbox juntos.
    if ([...this.changes.values()].some((c) => c.proposal_id === change.proposal_id)) {
      return false;
    }
    this.changes.set(change.change_id, { ...change });
    for (const event of outboxEvents) this._insertOutbox(event);
    return true;
  }

  async updateChangeState(changeId: string, updates: Partial<ChangeRow>, outboxEvents: AuditEvent[]): Promise<boolean> {
    const row = this.changes.get(changeId);
    if (!row) return false;
    Object.assign(row, updates);
    for (const event of outboxEvents) this._insertOutbox(event);
    return true;
  }

  async insertGraceJob(job: GraceJobRow): Promise<void> {
    this.graceJobs.set(job.job_id, { ...job });
  }

  async dueGraceJobs(nowIso: string): Promise<GraceJobRow[]> {
    return [...this.graceJobs.values()]
      .filter((j) => j.status === "pending" && j.run_at <= nowIso)
      .sort((a, b) => a.run_at.localeCompare(b.run_at))
      .map((j) => ({ ...j }));
  }

  async casGraceJobStatus(jobId: string, fromStatus: string, updates: Partial<GraceJobRow>): Promise<boolean> {
    const row = this.graceJobs.get(jobId);
    if (!row || row.status !== fromStatus) return false;
    Object.assign(row, updates);
    return true;
  }

  async getGraceJobByProposal(proposalId: string): Promise<GraceJobRow | null> {
    const rows = [...this.graceJobs.values()]
      .filter((j) => j.proposal_id === proposalId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    return rows[0] ? { ...rows[0] } : null;
  }

  async insertGatewayJti(jti: string, expiresAt: string): Promise<boolean> {
    if (this.gatewayJtis.has(jti)) return false; // replay §9.4
    this.gatewayJtis.set(jti, expiresAt);
    return true;
  }

  async purgeGatewayJtis(nowIso: string): Promise<number> {
    let n = 0;
    for (const [jti, exp] of this.gatewayJtis) {
      if (exp <= nowIso) {
        this.gatewayJtis.delete(jti);
        n += 1;
      }
    }
    return n;
  }

  private _insertOutbox(event: AuditEvent): boolean {
    if (this.outbox.has(event.event_id)) return false; // dedup §6
    this.outbox.set(event.event_id, {
      event_id: event.event_id,
      payload: event,
      created_at: (event.ts as string) ?? new Date().toISOString(),
      delivered_at: null,
    });
    return true;
  }

  async insertOutboxEvents(events: AuditEvent[]): Promise<number> {
    return events.reduce((n, e) => n + (this._insertOutbox(e) ? 1 : 0), 0);
  }

  async undeliveredOutbox(limit: number): Promise<OutboxRow[]> {
    return [...this.outbox.values()]
      .filter((r) => r.delivered_at === null)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .slice(0, limit)
      .map((r) => ({ ...r }));
  }

  async markOutboxDelivered(eventIds: string[], deliveredAt: string): Promise<void> {
    for (const id of eventIds) {
      const row = this.outbox.get(id);
      if (row) row.delivered_at = deliveredAt;
    }
  }
}
