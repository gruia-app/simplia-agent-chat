import { type ProviderCapabilities } from "simplia-agent-chat/core/providers";
export declare const ACV2_PROVIDER_CAPABILITIES: {
    readonly claude: {
        readonly integrationMode: "sdk";
        readonly resume: "none";
        readonly subagents: true;
        readonly modelFamily: "claude";
        readonly auth: "cli_login";
        readonly features: import("simplia-agent-chat/core/providers").AgentProviderFeatures;
    };
    readonly codex_cli: {
        readonly integrationMode: "cli";
        readonly resume: "none";
        readonly subagents: true;
        readonly modelFamily: "gpt";
        readonly auth: "cli_login";
        readonly features: import("simplia-agent-chat/core/providers").AgentProviderFeatures;
    };
    readonly cursor_cli: {
        readonly integrationMode: "cli";
        readonly resume: "none";
        readonly subagents: false;
        readonly modelFamily: null;
        readonly auth: "cli_login";
        readonly features: import("simplia-agent-chat/core/providers").AgentProviderFeatures;
    };
    readonly grok_cli: {
        readonly integrationMode: "cli";
        readonly resume: "none";
        readonly subagents: true;
        readonly modelFamily: null;
        readonly auth: "cli_login";
        readonly features: import("simplia-agent-chat/core/providers").AgentProviderFeatures;
    };
    readonly gemini: {
        readonly integrationMode: "cli";
        readonly resume: "none";
        readonly subagents: true;
        readonly modelFamily: null;
        readonly auth: "cli_login";
        readonly features: import("simplia-agent-chat/core/providers").AgentProviderFeatures;
    };
    readonly opencode_cli: {
        readonly integrationMode: "cli";
        readonly resume: "warm";
        readonly subagents: true;
        readonly modelFamily: null;
        readonly auth: "api_key";
        readonly features: import("simplia-agent-chat/core/providers").AgentProviderFeatures;
    };
    readonly kimi_cli: {
        readonly integrationMode: "cli";
        readonly resume: "none";
        readonly subagents: false;
        readonly modelFamily: null;
        readonly auth: "cli_login";
        readonly features: import("simplia-agent-chat/core/providers").AgentProviderFeatures;
    };
    readonly kilo_code: {
        readonly integrationMode: "cli";
        readonly resume: "warm";
        readonly subagents: false;
        readonly modelFamily: null;
        readonly auth: "api_key";
        readonly features: import("simplia-agent-chat/core/providers").AgentProviderFeatures;
    };
    readonly pi_cli: {
        readonly integrationMode: "cli";
        readonly resume: "warm";
        readonly subagents: false;
        readonly modelFamily: null;
        readonly auth: "api_key";
        readonly features: import("simplia-agent-chat/core/providers").AgentProviderFeatures;
    };
};
export type Acv2ProviderKey = keyof typeof ACV2_PROVIDER_CAPABILITIES;
export declare function isAcv2ProviderKey(value: string): value is Acv2ProviderKey;
export declare function acv2ProviderCapabilities(value: string): ProviderCapabilities | undefined;
//# sourceMappingURL=providers.d.ts.map