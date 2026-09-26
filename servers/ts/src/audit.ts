/** AuditEvent (§6) y outbox.
 *
 * - Campos exactos de §6; nunca input, preview ni contenido.
 * - At-least-once, deduplicación por event_id.
 * - `applied`, `reverted` y `compensated` se escriben en el outbox dentro
 *   de la MISMA transacción que el efecto.
 * - Sink configurable: log JSON por defecto hasta F2; HttpAuditSink con la
 *   forma de F2 (POST /v1/audit/events, lotes <= 100, 202, idempotente).
 */

import { randomUUID } from "node:crypto";

export const AUDIT_ACTIONS = [
  "proposed",
  "accepted",
  "applied",
  "reverted",
  "compensated",
  "discarded",
  "expired",
  "denied",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_FIELDS = [
  "schema_version",
  "event_id",
  "ts",
  "org_id",
  "app_key",
  "user_id",
  "tool",
  "proposal_id",
  "change_id",
  "payload_hash",
  "action",
  "via",
  "client_id",
  "client_verified",
  "confirm_channel",
  "confirm_effective",
  "denied_layer",
  "cost_estimate",
  "cost_actual",
  "cost_unit",
  "result",
  "error_code",
] as const;

export type CostUnit = "credits" | "money_cents";
export type AuditVia = "ui" | "mcp" | "cli";
export type ConfirmChannel = "ui" | "review_url" | "elicitation" | "cli_tty";

/** Canal por el que llegó la acción (§6 rev 4): lo fija el transporte
 * autenticado (UI, gateway MCP, CLI), nunca el cliente. */
export interface RouteInfo {
  via?: AuditVia;
  client_id?: string | null;
  client_verified?: boolean | null;
  confirm_channel?: ConfirmChannel | null;
}

export interface AuditEventParams {
  ts: string;
  org_id: string;
  app_key: string;
  user_id: string;
  tool: string;
  proposal_id: string;
  payload_hash: string;
  action: AuditAction;
  confirm_effective: string;
  result: "ok" | "error";
  via?: AuditVia;
  client_id?: string | null;
  client_verified?: boolean | null;
  confirm_channel?: ConfirmChannel | null;
  change_id?: string | null;
  denied_layer?: "entitlement" | "role" | "policy" | "token" | null;
  cost_estimate?: number;
  cost_actual?: number | null;
  cost_unit: CostUnit;
  error_code?: string | null;
  event_id?: string;
}

export type AuditEvent = Record<string, unknown> & {
  schema_version: 1;
  event_id: string;
  action: AuditAction;
};

export function buildAuditEvent(p: AuditEventParams): AuditEvent {
  return {
    schema_version: 1,
    event_id: p.event_id ?? randomUUID(),
    ts: p.ts,
    org_id: p.org_id,
    app_key: p.app_key,
    user_id: p.user_id,
    tool: p.tool,
    proposal_id: p.proposal_id,
    change_id: p.change_id ?? null,
    payload_hash: p.payload_hash,
    action: p.action,
    via: p.via ?? "ui",
    client_id: p.client_id ?? null,
    client_verified: p.client_verified ?? null,
    confirm_channel: p.confirm_channel ?? null,
    confirm_effective: p.confirm_effective,
    denied_layer: p.denied_layer ?? null,
    cost_estimate: p.cost_estimate ?? 0.0,
    cost_actual: p.cost_actual ?? null,
    cost_unit: p.cost_unit,
    result: p.result,
    error_code: p.error_code ?? null,
  };
}

export interface AuditSink {
  deliver(events: AuditEvent[]): Promise<void>;
}

/** Sink por defecto hasta F2: log JSON (una línea por evento). */
export class JsonLinesSink implements AuditSink {
  readonly events: AuditEvent[] = [];

  constructor(private readonly write?: (line: string) => void) {}

  async deliver(events: AuditEvent[]): Promise<void> {
    for (const event of events) {
      this.write?.(JSON.stringify(event));
      this.events.push(event);
    }
  }
}

export type AuditTransport = (
  url: string,
  headers: Record<string, string>,
  body: unknown,
) => Promise<{ status: number }>;

/** Forma de F2: POST /v1/audit/events en lotes <= 100, 202, idempotente. */
export class HttpAuditSink implements AuditSink {
  constructor(
    private readonly baseUrl: string,
    private readonly serviceToken: string,
    private readonly transport: AuditTransport,
    private readonly batchSize = 100,
  ) {}

  async deliver(events: AuditEvent[]): Promise<void> {
    const size = Math.min(this.batchSize, 100);
    for (let start = 0; start < events.length; start += size) {
      const batch = events.slice(start, start + size);
      const result = await this.transport(
        `${this.baseUrl.replace(/\/$/, "")}/v1/audit/events`,
        { authorization: `Bearer ${this.serviceToken}`, "content-type": "application/json" },
        { events: batch },
      );
      if (result.status !== 202) {
        throw new Error(`audit sink http ${result.status}`);
      }
    }
  }
}

export interface OutboxStore {
  undeliveredOutbox(limit: number): Promise<Array<{ event_id: string; payload: AuditEvent }>>;
  markOutboxDelivered(eventIds: string[], deliveredAt: string): Promise<void>;
}

/** Drena el outbox hacia el sink; si el sink cae, nada se pierde (§6). */
export class OutboxDrainer {
  constructor(
    private readonly storage: OutboxStore,
    private readonly sink: AuditSink,
    private readonly batchSize = 100,
  ) {}

  async drain(nowIso: string, limit?: number): Promise<number> {
    let delivered = 0;
    for (;;) {
      const batch = await this.storage.undeliveredOutbox(
        Math.min(this.batchSize, limit ?? this.batchSize),
      );
      if (batch.length === 0) return delivered;
      await this.sink.deliver(batch.map((row) => row.payload));
      await this.storage.markOutboxDelivered(batch.map((row) => row.event_id), nowIso);
      delivered += batch.length;
      if (limit !== undefined && delivered >= limit) return delivered;
    }
  }
}
