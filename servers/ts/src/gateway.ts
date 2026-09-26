/** Modo delegado del gateway (SPEC-CHAT-F1-R687 rev 5 §9.3–§9.4).
 *
 * - El sujeto viaja en una aserción firmada por el kernel: JWT con
 *   `aud=app_key`, `exp-iat <= 60 s`, `jti` de un solo uso (guardado en
 *   storage durante el exp), `sub`, `org`, `mcp_token_id`, `scopes`,
 *   `client_id`, `client_verified`.
 * - El token de servicio autentica el canal y NUNCA basta por sí solo;
 *   sin aserción → 401. jti repetido → 401.
 * - Herramientas de sistema `<app_key>__proposal__apply|revert|get`; el
 *   ns `proposal` está reservado.
 * - Las escrituras por MCP solo crean proposals y devuelven ProposalRef;
 *   `apply`/`revert` ejecutan por elicitation únicamente si se cumplen
 *   TODAS las condiciones de §9.3; en cualquier otro caso devuelven
 *   `review_url` (sin token) sin ejecutar.
 * - `get`, `apply` y `revert` exigen mismo user_id, org_id y app_key;
 *   si no, 404 (anti-IDOR).
 * - CLI (§9.5): con `via="cli"` apply/revert exigen confirmación TTY
 *   (`cliTtyConfirmed`) y solo lo reversible con card; todo lo demás
 *   devuelve `review_url`. No existe flag `--yes` ni equivalente.
 */

import { createPublicKey, createSign, createVerify, randomUUID } from "node:crypto";
import type { JsonWebKeyInput, KeyObject } from "node:crypto";

import { fromMcpName } from "@simplia/agent-chat-contract";

import { forbidden, notFound, unauthorized } from "./errors.js";
import type { AgentToolsService, RouteInfo } from "./service.js";
import type { ChangeRow, ProposalRow } from "./storage.js";

export const ASSERTION_MAX_LIFETIME_S = 60;

const REQUIRED_ASSERTION_CLAIMS = [
  "exp",
  "iat",
  "jti",
  "sub",
  "org",
  "mcp_token_id",
  "scopes",
  "client_id",
  "client_verified",
] as const;

export interface DelegatedAssertion {
  userId: string;
  orgId: string;
  mcpTokenId: string;
  scopes: ReadonlySet<string>;
  clientId: string;
  clientVerified: boolean;
  jti: string;
}

export type JwksResolver = (kid: string | undefined) => string | object;

/** §9.5: por la CLI solo se aplica lo reversible con `card` y solo si
 * stdin y stdout son TTY. No existe flag `--yes` ni equivalente: la
 * firma de esta función no admite bypass. */
export function cliApplyAllowed(effect: string, confirmEffective: string, isTty: boolean): boolean {
  return effect === "reversible" && confirmEffective === "card" && isTty;
}

/** Resolver §9.4 a partir de un documento JWKS `{keys: [...]}`: busca
 * la clave pública por `kid`. Lanza si el kid no está. */
export function jwksResolverFromDocument(jwks: { keys?: unknown[] } | null | undefined): JwksResolver {
  const keys = (jwks?.keys ?? []).filter((k): k is Record<string, unknown> => typeof k === "object" && k !== null);
  return (kid) => {
    for (const jwk of keys) {
      if (jwk.kid === kid || (kid === undefined && keys.length === 1)) return jwk;
    }
    throw new Error(`kid ${kid ?? "<none>"} not in JWKS`);
  };
}
export type ServiceTokenVerifier = (token: string) => boolean;
export type ElicitFn = (proposal: unknown) => string | Promise<string>;

export interface DelegatedGatewayDeps {
  service: AgentToolsService;
  appKey: string;
  jwksResolver: JwksResolver;
  serviceTokenVerifier?: ServiceTokenVerifier;
  /** Allowlist de client_id verificados (§9.3). */
  verifiedClients?: ReadonlySet<string>;
  /** Plantilla con `{proposal_id}`; nunca incluye un token (§9.2). */
  reviewUrlTemplate?: string;
  /** `elicitation/create` del cliente; ausente → siempre review_url. */
  elicit?: ElicitFn;
}

function b64urlDecode(input: string): string {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64").toString("utf8");
}

function decodeJwt(token: string): { header: Record<string, unknown>; payload: Record<string, unknown>; signed: string; signature: Buffer } {
  const parts = token.split(".");
  if (parts.length !== 3) throw unauthorized("malformed assertion", "invalid_assertion");
  const [h, p, s] = parts as [string, string, string];
  return {
    header: JSON.parse(b64urlDecode(h)) as Record<string, unknown>,
    payload: JSON.parse(b64urlDecode(p)) as Record<string, unknown>,
    signed: `${h}.${p}`,
    signature: Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64"),
  };
}

export class DelegatedGateway {
  private readonly service: AgentToolsService;
  private readonly appKey: string;
  private readonly jwksResolver: JwksResolver;
  private readonly serviceTokenVerifier: ServiceTokenVerifier;
  private readonly verifiedClients: ReadonlySet<string>;
  private readonly reviewUrlTemplate: string;
  private readonly elicit: ElicitFn | null;

  constructor(deps: DelegatedGatewayDeps) {
    this.service = deps.service;
    this.appKey = deps.appKey;
    this.jwksResolver = deps.jwksResolver;
    this.serviceTokenVerifier = deps.serviceTokenVerifier ?? (() => false);
    this.verifiedClients = deps.verifiedClients ?? new Set();
    this.reviewUrlTemplate = deps.reviewUrlTemplate ?? "/agent/proposals/{proposal_id}";
    this.elicit = deps.elicit ?? null;
  }

  // ------------------------------------------------------------ §9.4

  /** Verifica canal (token de servicio) + sujeto (aserción firmada).
   * Cualquier fallo → 401. */
  async verifyAssertion(params: {
    assertion?: string | null;
    serviceToken?: string | null;
    now?: string | undefined;
  }): Promise<DelegatedAssertion> {
    if (!params.serviceToken || !this.serviceTokenVerifier(params.serviceToken)) {
      throw unauthorized("service token missing or invalid", "invalid_service_token");
    }
    if (!params.assertion) {
      throw unauthorized("delegated assertion required", "assertion_required");
    }
    let decoded: ReturnType<typeof decodeJwt>;
    try {
      decoded = decodeJwt(params.assertion);
      const alg = decoded.header.alg;
      if (alg !== "RS256" && alg !== "ES256") throw new Error(`bad alg ${alg}`);
      let key = this.jwksResolver(decoded.header.kid as string | undefined) as string | KeyObject;
      if (typeof key === "object" && (key as unknown as Record<string, unknown>).kty !== undefined) {
        key = createPublicKey({ key: key as unknown as JsonWebKeyInput["key"], format: "jwk" });
      }
      const verify = createVerify(alg === "ES256" ? "SHA256" : "RSA-SHA256");
      verify.update(decoded.signed);
      const keyInput =
        alg === "ES256"
          ? ({ key, dsaEncoding: "ieee-p1363" } as Parameters<typeof verify.verify>[0])
          : (key as Parameters<typeof verify.verify>[0]);
      const ok = verify.verify(keyInput, decoded.signature);
      if (!ok) throw new Error("bad signature");
    } catch (error) {
      if ((error as { status?: number }).status === 401) throw error;
      throw unauthorized(`invalid assertion: ${(error as Error).name}`, "invalid_assertion");
    }
    const claims = decoded.payload;
    const missing = REQUIRED_ASSERTION_CLAIMS.filter((c) => claims[c] === undefined);
    if (missing.length > 0) {
      throw unauthorized(`assertion missing claims ${missing.join(",")}`, "invalid_assertion");
    }
    const exp = Number(claims.exp);
    const iat = Number(claims.iat);
    if (claims.aud !== this.appKey) {
      throw unauthorized("assertion audience mismatch", "invalid_assertion");
    }
    if (!Number.isFinite(exp) || !Number.isFinite(iat) || exp - iat > ASSERTION_MAX_LIFETIME_S) {
      throw unauthorized("assertion lifetime exceeds 60s", "invalid_assertion");
    }
    if (exp * 1000 <= Date.parse(params.now ?? new Date().toISOString())) {
      throw unauthorized("assertion expired", "invalid_assertion");
    }
    if (!Array.isArray(claims.scopes) || claims.scopes.length === 0) {
      throw unauthorized("assertion missing scopes", "invalid_assertion");
    }
    // jti de un solo uso: false si ya existía (replay → 401).
    const firstUse = await this.service.storage.insertGatewayJti(
      String(claims.jti),
      new Date(exp * 1000).toISOString(),
    );
    if (!firstUse) {
      throw unauthorized("assertion jti already used", "assertion_replayed");
    }
    return {
      userId: String(claims.sub),
      orgId: String(claims.org),
      mcpTokenId: String(claims.mcp_token_id),
      scopes: new Set(claims.scopes.map(String)),
      clientId: String(claims.client_id),
      clientVerified: Boolean(claims.client_verified),
      jti: String(claims.jti),
    };
  }

  // ------------------------------------------------------------ §9.2

  /** tools/call delegado: escrituras crean Proposal (→ ProposalRef),
   * lecturas ejecutan la implementación read/preview. */
  async callTool(
    mcpName: string,
    args: Record<string, unknown> | undefined,
    params: {
      assertion?: string | null;
      serviceToken?: string | null;
      threadId?: string;
      /** Canal §9.6: "mcp" (defecto) o "cli" (reglas §9.5). */
      via?: "mcp" | "cli";
      /** §9.5: la CLI atestigua que stdin+stdout eran TTY. */
      cliTtyConfirmed?: boolean;
      now?: string | undefined;
    },
  ): Promise<unknown> {
    const via = params.via ?? "mcp";
    const subject = await this.verifyAssertion(params);
    let parts: { app_key: string; ns: string; verb: string };
    try {
      parts = fromMcpName(mcpName);
    } catch {
      throw notFound("unknown tool", "unknown_tool");
    }
    if (parts.app_key !== this.appKey) {
      throw notFound("unknown tool", "unknown_tool");
    }
    this.requireScope(subject, `app:${this.appKey}`);
    await this.checkMcpAccess(subject);

    const route: RouteInfo = {
      via,
      client_id: subject.clientId,
      client_verified: subject.clientVerified,
    };
    if (parts.ns === "proposal") {
      return this.systemTool(parts.verb, subject, route, args ?? {}, params.cliTtyConfirmed ?? false, params.now);
    }

    const toolName = `${parts.ns}.${parts.verb}`;
    const { spec, impl } = this.service.registry.get(toolName);
    if (spec.app_key !== this.appKey) {
      throw notFound("unknown tool", "unknown_tool");
    }
    this.requireScope(subject, `tool:${toolName}`, "tool:*");

    if (spec.effect === "read") {
      const run = (impl as { read?: (i: Record<string, unknown>) => unknown }).read ?? impl.preview;
      if (!run) throw forbidden("tool has no read implementation", "no_read_impl");
      return { result: run.call(impl, args ?? {}) };
    }

    // §9.2: las escrituras por MCP nunca aplican — crean Proposal.
    const { proposal } = await this.service.createProposal({
      tool: toolName,
      input: args ?? {},
      orgId: subject.orgId,
      userId: subject.userId,
      threadId: params.threadId ?? `${via}:${subject.mcpTokenId}`,
      route,
      now: params.now,
    });
    return {
      structuredContent: {
        proposal_id: proposal.id,
        tool: proposal.tool,
        diff: proposal.preview,
        estimate: proposal.estimate,
        confirm_effective: proposal.confirm_effective,
        effect: spec.effect,
        expires_at: proposal.expires_at,
        review_url: this.reviewUrl(proposal.id),
      },
    };
  }

  // ------------------------------------------------------------ §9.3

  private async systemTool(
    verb: string,
    subject: DelegatedAssertion,
    route: RouteInfo,
    args: Record<string, unknown>,
    cliTtyConfirmed: boolean,
    now?: string | undefined,
  ): Promise<unknown> {
    if (verb === "get") {
      const proposal = await this.proposalForSubject(args.proposal_id as string | undefined, subject);
      return { proposal };
    }
    if (verb === "apply") {
      const proposal = await this.proposalForSubject(args.proposal_id as string | undefined, subject);
      if (route.via === "cli") {
        return this.applyViaCli(proposal, subject, cliTtyConfirmed, now);
      }
      if (!(await this.elicitationAllowed(proposal, subject))) {
        return { review_url: this.reviewUrl(proposal.id) };
      }
      return this.applyViaElicitation(proposal, subject, route, now);
    }
    if (verb === "revert") {
      const change = await this.changeForSubject(args.change_id as string | undefined, subject);
      if (route.via === "cli") {
        return this.revertViaCli(change, subject, cliTtyConfirmed, now);
      }
      if (!(await this.elicitationAllowedForChange(change, subject))) {
        return { review_url: this.reviewUrl(change.proposal_id) };
      }
      return this.revertViaElicitation(change, subject, route, now);
    }
    throw notFound("unknown system tool", "unknown_tool");
  }

  private async applyViaCli(
    proposal: ProposalRow,
    subject: DelegatedAssertion,
    ttyConfirmed: boolean,
    now?: string | undefined,
  ): Promise<unknown> {
    /** §9.5: la CLI solo aplica lo reversible con card y solo con TTY;
     * en cualquier otro caso devuelve review_url sin ejecutar. */
    const { spec } = this.service.registry.get(proposal.tool);
    if (!cliApplyAllowed(spec.effect, proposal.confirm_effective, ttyConfirmed)) {
      return { review_url: this.reviewUrl(proposal.id) };
    }
    const confirmed: RouteInfo = {
      via: "cli",
      client_id: subject.clientId,
      client_verified: subject.clientVerified,
      confirm_channel: "cli_tty",
    };
    const accepted = await this.service.acceptProposal(proposal.id, {
      actorUserId: subject.userId,
      context: "user_confirmed",
      route: confirmed,
      now,
    });
    return this.service.applyProposal(proposal.id, {
      token: accepted.apply_token,
      actorUserId: subject.userId,
      context: "user_confirmed",
      route: confirmed,
      now,
    });
  }

  private async revertViaCli(
    change: ChangeRow,
    subject: DelegatedAssertion,
    ttyConfirmed: boolean,
    now?: string | undefined,
  ): Promise<unknown> {
    /** §9.5: revert por la CLI solo con TTY y modo revert; si no,
     * review_url. */
    if (!ttyConfirmed || change.undo_mode !== "revert" || change.state !== "applied") {
      return { review_url: this.reviewUrl(change.proposal_id) };
    }
    const confirmed: RouteInfo = {
      via: "cli",
      client_id: subject.clientId,
      client_verified: subject.clientVerified,
      confirm_channel: "cli_tty",
    };
    const issued = await this.service.createRevertToken(change.change_id, {
      actorUserId: subject.userId,
      orgId: subject.orgId,
      now,
    });
    return this.service.revertChange(change.change_id, {
      token: issued.revert_token,
      actorUserId: subject.userId,
      context: "user_confirmed",
      route: confirmed,
      now,
    });
  }

  private async proposalForSubject(proposalId: string | undefined, subject: DelegatedAssertion): Promise<ProposalRow> {
    /** Anti-IDOR §9.3: cualquier desajuste de user/org/app → 404. */
    const proposal = await this.service.storage.getProposal(proposalId ?? "");
    if (!proposal) throw notFound("proposal not found", "proposal_not_found");
    const { spec } = this.service.registry.get(proposal.tool);
    if (
      proposal.user_id !== subject.userId ||
      proposal.org_id !== subject.orgId ||
      spec.app_key !== this.appKey
    ) {
      throw notFound("proposal not found", "proposal_not_found");
    }
    this.requireScope(subject, `tool:${proposal.tool}`, "tool:*");
    return proposal;
  }

  private async changeForSubject(changeId: string | undefined, subject: DelegatedAssertion): Promise<ChangeRow> {
    const change = await this.service.storage.getChange(changeId ?? "");
    if (!change) throw notFound("change not found", "change_not_found");
    if (
      change.user_id !== subject.userId ||
      change.org_id !== subject.orgId ||
      change.app_key !== this.appKey
    ) {
      throw notFound("change not found", "change_not_found");
    }
    this.requireScope(subject, `tool:${change.tool}`, "tool:*");
    return change;
  }

  private async elicitationAllowed(proposal: ProposalRow, subject: DelegatedAssertion): Promise<boolean> {
    /** §9.3: apply por elicitation solo si TODAS las condiciones. */
    const { spec } = this.service.registry.get(proposal.tool);
    if (spec.effect !== "reversible" || proposal.confirm_effective !== "card") return false;
    if (!(await this.orgElicitationEnabled(proposal.org_id, spec.app_key))) return false;
    return this.clientVerified(subject);
  }

  private async elicitationAllowedForChange(change: ChangeRow, subject: DelegatedAssertion): Promise<boolean> {
    if (change.undo_mode !== "revert" || change.state !== "applied") return false;
    if (!(await this.orgElicitationEnabled(change.org_id, change.app_key))) return false;
    return this.clientVerified(subject);
  }

  private clientVerified(subject: DelegatedAssertion): boolean {
    return subject.clientVerified && this.verifiedClients.has(subject.clientId) && this.elicit !== null;
  }

  private async orgElicitationEnabled(orgId: string, appKey: string): Promise<boolean> {
    const decision = await this.service.entitlement.decide({
      orgId, appKey, userId: "", toolName: "*", effect: "read",
    });
    return Boolean(decision.entitlement?.elicitation_apply);
  }

  private async applyViaElicitation(
    proposal: ProposalRow,
    subject: DelegatedAssertion,
    route: RouteInfo,
    now?: string | undefined,
  ): Promise<unknown> {
    if ((await this.elicit!(proposal)) !== "accept") {
      return { review_url: this.reviewUrl(proposal.id) };
    }
    const elicited: RouteInfo = { ...route, confirm_channel: "elicitation" };
    const accepted = await this.service.acceptProposal(proposal.id, {
      actorUserId: subject.userId,
      context: "user_confirmed",
      route: elicited,
      now,
    });
    return this.service.applyProposal(proposal.id, {
      token: accepted.apply_token,
      actorUserId: subject.userId,
      context: "user_confirmed",
      route: elicited,
      now,
    });
  }

  private async revertViaElicitation(
    change: ChangeRow,
    subject: DelegatedAssertion,
    route: RouteInfo,
    now?: string | undefined,
  ): Promise<unknown> {
    if ((await this.elicit!({ change_id: change.change_id, tool: change.tool })) !== "accept") {
      return { review_url: this.reviewUrl(change.proposal_id) };
    }
    const elicited: RouteInfo = { ...route, confirm_channel: "elicitation" };
    const issued = await this.service.createRevertToken(change.change_id, {
      actorUserId: subject.userId,
      orgId: subject.orgId,
      now,
    });
    return this.service.revertChange(change.change_id, {
      token: issued.revert_token,
      actorUserId: subject.userId,
      context: "user_confirmed",
      route: elicited,
      now,
    });
  }

  // ------------------------------------------------------------ internos

  /** §9.2: SOLO el proposal_id en la URL — nunca un token. */
  private reviewUrl(proposalId: string): string {
    return this.reviewUrlTemplate.replace("{proposal_id}", proposalId);
  }

  private requireScope(subject: DelegatedAssertion, scope: string, wildcard?: string): void {
    if (subject.scopes.has(scope) || (wildcard && subject.scopes.has(wildcard))) return;
    throw forbidden(`missing scope ${scope}`, "scope_denied");
  }

  /** §9.4: entitlement `mcp_access` además de los scopes OAuth. */
  private async checkMcpAccess(subject: DelegatedAssertion): Promise<void> {
    const decision = await this.service.entitlement.decide({
      orgId: subject.orgId,
      appKey: this.appKey,
      userId: subject.userId,
      toolName: "*",
      effect: "read",
    });
    if (!decision.entitlement?.mcp_access) {
      throw forbidden("org lacks mcp_access entitlement", "mcp_access_denied");
    }
  }
}

/** Helper de tests: firma una aserción con la forma exacta de §9.4. */
export function issueTestAssertion(params: {
  privateKey: string | object;
  appKey: string;
  sub: string;
  org: string;
  mcpTokenId?: string;
  scopes?: string[];
  clientId?: string;
  clientVerified?: boolean;
  jti?: string;
  lifetimeS?: number;
  now?: Date;
  kid?: string;
}): string {
  const iat = Math.floor((params.now ?? new Date()).getTime() / 1000);
  const payload = {
    iss: "kernel",
    aud: params.appKey,
    iat,
    exp: iat + (params.lifetimeS ?? ASSERTION_MAX_LIFETIME_S),
    jti: params.jti ?? randomUUID(),
    sub: params.sub,
    org: params.org,
    mcp_token_id: params.mcpTokenId ?? "mtok-1",
    scopes: params.scopes ?? [],
    client_id: params.clientId ?? "cli-mcp-1",
    client_verified: params.clientVerified ?? true,
  };
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const header = { alg: "RS256", typ: "JWT", kid: params.kid ?? "test-key" };
  const signed = `${b64(header)}.${b64(payload)}`;
  const sign = createSign("RSA-SHA256");
  sign.update(signed);
  const signature = sign.sign(params.privateKey as Parameters<typeof sign.sign>[0]).toString("base64url");
  return `${signed}.${signature}`;
}
