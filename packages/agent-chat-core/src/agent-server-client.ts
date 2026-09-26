import type { Proposal, ToolSpec } from "@simplia/agent-chat-contract";

/**
 * Cliente HTTP del contrato de servidor (SPEC §5). TS puro, sin DOM: el
 * fetch y las cabeceras de sesión/CSRF se inyectan; el cliente nunca ve el
 * token de aplicación fuera de la llamada apply que lo transporta (§4).
 *
 * Endpoints:
 *   GET  /agent/tools
 *   POST /agent/proposals
 *   POST /agent/proposals/{id}/modify
 *   POST /agent/proposals/{id}/accept
 *   POST /agent/proposals/{id}/apply
 *   POST /agent/proposals/{id}/discard
 *   POST /agent/changes/{change_id}/revert-token
 *   POST /agent/changes/{change_id}/revert
 *   POST /agent/changes/{change_id}/compensate
 *   GET  /agent/proposals?thread_id=
 *
 * Errores: JSON `{code, message}` con status 400/403/404/409/410/422 →
 * AgentServerError (status + code + message preservados).
 */

export class AgentServerError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AgentServerError";
  }
}

export interface ToolContext {
  thread_id?: string;
  view?: string;
  [key: string]: unknown;
}

export interface AcceptResult {
  /** Token de aplicación de un solo uso (TTL ≤120 s, §4). */
  token: string;
  expires_in?: number;
}

export interface ApplyResult {
  change_id: string;
}

export interface RevertTokenResult {
  token: string;
  expires_in?: number;
}

export interface ApplyProposalRequest {
  token: string;
  ack_irreversible?: boolean;
}

export interface ChangeRequest {
  token: string;
  ack_irreversible?: boolean;
}

export interface ModifyProposalRequest {
  input: unknown;
}

export interface CreateProposalRequest {
  tool: string;
  input: unknown;
}

export interface AgentServerClient {
  listTools(context?: ToolContext): Promise<ToolSpec[]>;
  createProposal(request: CreateProposalRequest): Promise<Proposal>;
  modifyProposal(proposalId: string, request: ModifyProposalRequest): Promise<Proposal>;
  acceptProposal(proposalId: string): Promise<AcceptResult>;
  applyProposal(proposalId: string, request: ApplyProposalRequest): Promise<ApplyResult>;
  discardProposal(proposalId: string): Promise<Proposal>;
  createRevertToken(changeId: string): Promise<RevertTokenResult>;
  revertChange(changeId: string, request: ChangeRequest): Promise<ApplyResult>;
  compensateChange(changeId: string, request: ChangeRequest): Promise<ApplyResult>;
  listProposals(params: { thread_id: string }): Promise<Proposal[]>;
}

export interface AgentServerClientOptions {
  baseUrl: string;
  /** fetch inyectable; por defecto globalThis.fetch. */
  fetch?: typeof fetch;
  /** Cabeceras extra por petición (sesión, CSRF). Puede ser async. */
  headers?: () => Record<string, string> | Promise<Record<string, string>>;
}

type JsonBody = Record<string, unknown> | undefined;

export function createAgentServerClient(options: AgentServerClientOptions): AgentServerClient {
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const fetchImpl = options.fetch ?? globalThis.fetch?.bind(globalThis);
  if (!fetchImpl) throw new Error("agent-server client requires a fetch implementation");

  async function request<T>(method: string, path: string, body?: JsonBody): Promise<T> {
    const extraHeaders = (await options.headers?.()) ?? {};
    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        method,
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          ...extraHeaders,
        },
        body: body === undefined ? null : JSON.stringify(body),
      });
    } catch (cause) {
      throw new AgentServerError(0, "network_error", cause instanceof Error ? cause.message : "fetch failed");
    }
    if (!response.ok) {
      let code = "http_error";
      let message = `HTTP ${response.status}`;
      try {
        const payload = (await response.json()) as { code?: string; message?: string };
        if (typeof payload.code === "string") code = payload.code;
        if (typeof payload.message === "string") message = payload.message;
      } catch {
        // cuerpo no-JSON: conservar status+code genérico
      }
      throw new AgentServerError(response.status, code, message);
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  const post = <T>(path: string, body?: JsonBody) => request<T>("POST", path, body);

  return {
    listTools: (context) => {
      const params = new URLSearchParams();
      if (context?.thread_id) params.set("thread_id", context.thread_id);
      if (context?.view) params.set("view", context.view);
      const query = params.size > 0 ? `?${params.toString()}` : "";
      return request<ToolSpec[]>("GET", `/agent/tools${query}`);
    },
    createProposal: (req) => post<Proposal>("/agent/proposals", { ...req }),
    modifyProposal: (id, req) => post<Proposal>(`/agent/proposals/${encodeURIComponent(id)}/modify`, { ...req }),
    acceptProposal: (id) => post<AcceptResult>(`/agent/proposals/${encodeURIComponent(id)}/accept`),
    applyProposal: (id, req) => post<ApplyResult>(`/agent/proposals/${encodeURIComponent(id)}/apply`, { ...req }),
    discardProposal: (id) => post<Proposal>(`/agent/proposals/${encodeURIComponent(id)}/discard`),
    createRevertToken: (changeId) =>
      post<RevertTokenResult>(`/agent/changes/${encodeURIComponent(changeId)}/revert-token`),
    revertChange: (changeId, req) =>
      post<ApplyResult>(`/agent/changes/${encodeURIComponent(changeId)}/revert`, { ...req }),
    compensateChange: (changeId, req) =>
      post<ApplyResult>(`/agent/changes/${encodeURIComponent(changeId)}/compensate`, { ...req }),
    listProposals: ({ thread_id }) =>
      request<Proposal[]>("GET", `/agent/proposals?thread_id=${encodeURIComponent(thread_id)}`),
  };
}
