import { createAgentProviderFeatures, } from "simplia-agent-chat/core/providers";
export const ACV2_PROVIDER_CAPABILITIES = {
    claude: {
        integrationMode: "sdk",
        resume: "none",
        subagents: true,
        modelFamily: "claude",
        auth: "cli_login",
        features: createAgentProviderFeatures({ subagents: "supported" }),
    },
    codex_cli: {
        integrationMode: "cli",
        resume: "none",
        subagents: true,
        modelFamily: "gpt",
        auth: "cli_login",
        features: createAgentProviderFeatures({
            subagents: "supported",
            steer: "supported",
            rollback: "supported",
            userInput: "supported",
            approvals: "supported",
            filesystemRead: "supported",
            filesystemWrite: "supported",
            terminal: "supported",
            reasoning: "supported",
            plan: "supported",
        }),
    },
    cursor_cli: {
        integrationMode: "cli",
        resume: "none",
        subagents: false,
        modelFamily: null,
        auth: "cli_login",
        features: createAgentProviderFeatures(),
    },
    grok_cli: {
        integrationMode: "cli",
        resume: "none",
        subagents: true,
        modelFamily: null,
        auth: "cli_login",
        features: createAgentProviderFeatures({ subagents: "supported", approvals: "supported" }),
    },
    gemini: {
        integrationMode: "cli",
        resume: "none",
        subagents: true,
        modelFamily: null,
        auth: "cli_login",
        features: createAgentProviderFeatures({ subagents: "supported" }),
    },
    opencode_cli: {
        integrationMode: "cli",
        resume: "warm",
        subagents: true,
        modelFamily: null,
        auth: "api_key",
        features: createAgentProviderFeatures({
            resume: "supported",
            rollback: "supported",
            subagents: "supported",
        }),
    },
    kimi_cli: {
        integrationMode: "cli",
        resume: "none",
        subagents: false,
        modelFamily: null,
        auth: "cli_login",
        features: createAgentProviderFeatures(),
    },
    kilo_code: {
        integrationMode: "cli",
        resume: "warm",
        subagents: false,
        modelFamily: null,
        auth: "api_key",
        features: createAgentProviderFeatures({ resume: "supported" }),
    },
    pi_cli: {
        integrationMode: "cli",
        resume: "warm",
        subagents: false,
        modelFamily: null,
        auth: "api_key",
        features: createAgentProviderFeatures({ resume: "supported" }),
    },
};
export function isAcv2ProviderKey(value) {
    return Object.hasOwn(ACV2_PROVIDER_CAPABILITIES, value);
}
export function acv2ProviderCapabilities(value) {
    return isAcv2ProviderKey(value) ? ACV2_PROVIDER_CAPABILITIES[value] : undefined;
}
//# sourceMappingURL=providers.js.map