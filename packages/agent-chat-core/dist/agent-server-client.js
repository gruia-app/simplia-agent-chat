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
    status;
    code;
    constructor(status, code, message) {
        super(message);
        this.status = status;
        this.code = code;
        this.name = "AgentServerError";
    }
}
export function createAgentServerClient(options) {
    const baseUrl = options.baseUrl.replace(/\/+$/, "");
    const fetchImpl = options.fetch ?? globalThis.fetch?.bind(globalThis);
    if (!fetchImpl)
        throw new Error("agent-server client requires a fetch implementation");
    async function request(method, path, body) {
        const extraHeaders = (await options.headers?.()) ?? {};
        let response;
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
        }
        catch (cause) {
            throw new AgentServerError(0, "network_error", cause instanceof Error ? cause.message : "fetch failed");
        }
        if (!response.ok) {
            let code = "http_error";
            let message = `HTTP ${response.status}`;
            try {
                const payload = (await response.json());
                if (typeof payload.code === "string")
                    code = payload.code;
                if (typeof payload.message === "string")
                    message = payload.message;
            }
            catch {
                // cuerpo no-JSON: conservar status+code genérico
            }
            throw new AgentServerError(response.status, code, message);
        }
        if (response.status === 204)
            return undefined;
        return (await response.json());
    }
    const post = (path, body) => request("POST", path, body);
    return {
        listTools: (context) => {
            const params = new URLSearchParams();
            if (context?.thread_id)
                params.set("thread_id", context.thread_id);
            if (context?.view)
                params.set("view", context.view);
            const query = params.size > 0 ? `?${params.toString()}` : "";
            return request("GET", `/agent/tools${query}`);
        },
        createProposal: (req) => post("/agent/proposals", { ...req }),
        modifyProposal: (id, req) => post(`/agent/proposals/${encodeURIComponent(id)}/modify`, { ...req }),
        acceptProposal: (id) => post(`/agent/proposals/${encodeURIComponent(id)}/accept`),
        applyProposal: (id, req) => post(`/agent/proposals/${encodeURIComponent(id)}/apply`, { ...req }),
        discardProposal: (id) => post(`/agent/proposals/${encodeURIComponent(id)}/discard`),
        createRevertToken: (changeId) => post(`/agent/changes/${encodeURIComponent(changeId)}/revert-token`),
        revertChange: (changeId, req) => post(`/agent/changes/${encodeURIComponent(changeId)}/revert`, { ...req }),
        compensateChange: (changeId, req) => post(`/agent/changes/${encodeURIComponent(changeId)}/compensate`, { ...req }),
        listProposals: ({ thread_id }) => request("GET", `/agent/proposals?thread_id=${encodeURIComponent(thread_id)}`),
    };
}
//# sourceMappingURL=agent-server-client.js.map