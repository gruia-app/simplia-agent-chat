/** Capa 1 de las tres del apply (§4): entitlement chat_tools.
 *
 * - `StubEntitlement` deniega por defecto (§4).
 * - `HttpEntitlementChecker` implementa §8: GET /v1/entitlements/{org}/{app}
 *   con el token de servicio de la app — nunca el JWT de sesión — y
 *   fail-closed si el kernel no responde. Caché de decisiones <= 60 s.
 */

export interface CostThreshold {
  credits?: number | null;
  money_cents?: number | null;
}

export interface ChatToolsEntitlement {
  enabled: boolean;
  tools_allow: string[];
  max_effect: "read" | "reversible" | "irreversible";
  byo_llm: boolean;
  /** §9.4: la org puede recibir llamadas delegadas del gateway MCP. */
  mcp_access: boolean;
  /** §9.3: la org permite apply/revert por elicitation (por defecto no). */
  elicitation_apply: boolean;
  cost_threshold: CostThreshold;
}

export interface EntitlementDecision {
  allowed: boolean;
  denied_layer?: "entitlement";
  reason?: string;
  entitlement?: ChatToolsEntitlement;
}

const EFFECT_ORDER: Record<string, number> = {
  read: 0,
  reversible: 1,
  irreversible: 2,
};

export function entitlementFromRow(row: Record<string, unknown> | null | undefined): ChatToolsEntitlement {
  if (!row) {
    return {
      enabled: false,
      tools_allow: [],
      max_effect: "read",
      byo_llm: false,
      mcp_access: false,
      elicitation_apply: false,
      cost_threshold: {},
    };
  }
  const tools = row.tools_allow;
  const allow = tools === "*" ? ["*"] : Array.isArray(tools) ? (tools as string[]) : [];
  const threshold = (row.cost_threshold ?? {}) as CostThreshold;
  return {
    enabled: Boolean(row.enabled),
    tools_allow: allow,
    max_effect: (row.max_effect as ChatToolsEntitlement["max_effect"]) ?? "read",
    byo_llm: Boolean(row.byo_llm),
    mcp_access: Boolean(row.mcp_access),
    elicitation_apply: Boolean(row.elicitation_apply),
    cost_threshold: threshold,
  };
}

export function evaluateEntitlement(
  entitlement: ChatToolsEntitlement,
  params: { toolName: string; effect: string },
): EntitlementDecision {
  if (!entitlement.enabled) {
    return { allowed: false, denied_layer: "entitlement", reason: "chat_tools_disabled", entitlement };
  }
  const allow = entitlement.tools_allow;
  if (allow.length > 0 && !allow.includes("*") && !allow.includes(params.toolName)) {
    return { allowed: false, denied_layer: "entitlement", reason: "tool_not_allowed", entitlement };
  }
  if ((EFFECT_ORDER[params.effect] ?? 99) > EFFECT_ORDER[entitlement.max_effect]!) {
    return { allowed: false, denied_layer: "entitlement", reason: "max_effect_exceeded", entitlement };
  }
  return { allowed: true, entitlement };
}

export interface EntitlementChecker {
  decide(params: {
    orgId: string;
    appKey: string;
    userId: string;
    toolName: string;
    effect: string;
  }): Promise<EntitlementDecision>;
}

/** Hasta F2: por defecto deniega. `allow`/`rows` lo abren en tests. */
export class StubEntitlement implements EntitlementChecker {
  constructor(
    private readonly allow = false,
    private readonly rows: Record<string, Record<string, unknown>> = {},
  ) {}

  async decide(params: { orgId: string; appKey: string; toolName: string; effect: string }): Promise<EntitlementDecision> {
    if (!this.allow) {
      return { allowed: false, denied_layer: "entitlement", reason: "entitlement_stub_denied" };
    }
    const row = this.rows[`${params.orgId}/${params.appKey}`];
    if (row === undefined) {
      return { allowed: true };
    }
    return evaluateEntitlement(entitlementFromRow(row), params);
  }
}

export type EntitlementTransport = (
  url: string,
  headers: Record<string, string>,
) => Promise<{ status: number; json: unknown }>;

/** Cliente §8 del kernel: fail-closed ante cualquier error, caché <= 60 s. */
export class HttpEntitlementChecker implements EntitlementChecker {
  private readonly cache = new Map<string, { at: number; row: Record<string, unknown> | null }>();
  private readonly cacheTtlMs: number;

  constructor(
    private readonly baseUrl: string,
    private readonly serviceToken: string,
    private readonly transport: EntitlementTransport,
    cacheTtlMs = 60_000,
  ) {
    this.cacheTtlMs = Math.min(cacheTtlMs, 60_000);
  }

  private async fetchRow(orgId: string, appKey: string): Promise<Record<string, unknown> | null> {
    const key = `${orgId}/${appKey}`;
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.at <= this.cacheTtlMs) return cached.row;
    const url = `${this.baseUrl.replace(/\/$/, "")}/v1/entitlements/${orgId}/${appKey}`;
    const result = await this.transport(url, { authorization: `Bearer ${this.serviceToken}` });
    if (result.status !== 200) {
      throw new Error(`entitlement http ${result.status}`);
    }
    const row = (result.json ?? null) as Record<string, unknown> | null;
    this.cache.set(key, { at: Date.now(), row });
    return row;
  }

  async decide(params: { orgId: string; appKey: string; toolName: string; effect: string }): Promise<EntitlementDecision> {
    let row: Record<string, unknown> | null;
    try {
      row = await this.fetchRow(params.orgId, params.appKey);
    } catch (error) {
      // §4: kernel caído → deny fail-closed
      return {
        allowed: false,
        denied_layer: "entitlement",
        reason: `entitlement_unavailable:${(error as Error).name}`,
      };
    }
    return evaluateEntitlement(entitlementFromRow(row), params);
  }
}
