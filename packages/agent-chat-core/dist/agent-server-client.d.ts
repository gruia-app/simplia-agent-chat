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
export declare class AgentServerError extends Error {
    readonly status: number;
    readonly code: string;
    constructor(status: number, code: string, message: string);
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
    listProposals(params: {
        thread_id: string;
    }): Promise<Proposal[]>;
}
export interface AgentServerClientOptions {
    baseUrl: string;
    /** fetch inyectable; por defecto globalThis.fetch. */
    fetch?: typeof fetch;
    /** Cabeceras extra por petición (sesión, CSRF). Puede ser async. */
    headers?: () => Record<string, string> | Promise<Record<string, string>>;
}
export declare function createAgentServerClient(options: AgentServerClientOptions): AgentServerClient;
//# sourceMappingURL=agent-server-client.d.ts.map