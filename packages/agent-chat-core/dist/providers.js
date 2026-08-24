function cloneProviderDefinition(provider) {
    const cloned = {
        ...provider,
        modes: [...provider.modes],
        authMethods: [...provider.authMethods],
    };
    if (provider.metadata)
        cloned.metadata = structuredClone(provider.metadata);
    return cloned;
}
function validateProviderDefinition(provider) {
    if (!provider.id.trim() || !provider.displayName.trim()) {
        throw new Error("invalid_provider_definition");
    }
    if (provider.modes.length === 0 || provider.authMethods.length === 0) {
        throw new Error("invalid_provider_definition");
    }
}
export function createProviderCatalog(initial = []) {
    const providers = new Map();
    const register = (provider) => {
        validateProviderDefinition(provider);
        const id = provider.id.trim();
        if (providers.has(id))
            throw new Error(`provider_already_registered:${id}`);
        providers.set(id, cloneProviderDefinition({ ...provider, id }));
    };
    for (const provider of initial)
        register(provider);
    return {
        list: () => [...providers.values()].map(cloneProviderDefinition),
        get: (providerId) => {
            const provider = providers.get(providerId);
            return provider ? cloneProviderDefinition(provider) : undefined;
        },
        register,
    };
}
function optionalString(value) {
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
export function sanitizeProviderConnection(input) {
    const identityInput = input.identity && typeof input.identity === "object" && !Array.isArray(input.identity)
        ? input.identity
        : undefined;
    const identity = identityInput ? {
        email: optionalString(identityInput.email),
        displayName: optionalString(identityInput.displayName),
        accountId: optionalString(identityInput.accountId),
        organization: optionalString(identityInput.organization),
        plan: optionalString(identityInput.plan),
    } : undefined;
    const safeIdentity = identity && Object.values(identity).some(Boolean)
        ? Object.fromEntries(Object.entries(identity).filter(([, value]) => value !== undefined))
        : undefined;
    const summary = {
        id: optionalString(input.id) ?? "",
        providerId: optionalString(input.providerId) ?? "",
        label: optionalString(input.label) ?? "",
        scope: input.scope === "organization" ? "organization" : "personal",
        status: ["pending", "connected", "reconnect_required", "unavailable", "disabled"].includes(String(input.status)) ? input.status : "unavailable",
        authMethod: ["chatgpt_device", "oauth_device", "setup_token", "api_key", "cli_login", "none"].includes(String(input.authMethod)) ? input.authMethod : "none",
    };
    if (safeIdentity)
        summary.identity = safeIdentity;
    const defaultModel = optionalString(input.defaultModel);
    const statusReason = optionalString(input.statusReason);
    const lastCheckedAt = optionalString(input.lastCheckedAt);
    if (defaultModel)
        summary.defaultModel = defaultModel;
    if (typeof input.isDefault === "boolean")
        summary.isDefault = input.isDefault;
    if (statusReason)
        summary.statusReason = statusReason;
    if (lastCheckedAt)
        summary.lastCheckedAt = lastCheckedAt;
    return summary;
}
export const BASE_AGENT_FEATURES = {
    streaming: "supported",
    tools: "supported",
    filesystemRead: "unknown",
    filesystemWrite: "unknown",
    terminal: "unknown",
    approvals: "unknown",
    userInput: "unknown",
    steer: "unknown",
    resume: "unknown",
    rollback: "unknown",
    attachments: "unknown",
    reasoning: "unknown",
    plan: "unknown",
    subagents: "unknown",
};
export const CHAT_COMPLETION_FEATURES = {
    streaming: "supported",
    tools: "supported",
    filesystemRead: "unsupported",
    filesystemWrite: "unsupported",
    terminal: "unsupported",
    approvals: "unsupported",
    userInput: "unsupported",
    steer: "unsupported",
    resume: "unsupported",
    rollback: "unsupported",
    attachments: "supported",
    reasoning: "unknown",
    plan: "unsupported",
    subagents: "unsupported",
};
export function createAgentProviderFeatures(overrides = {}) {
    return { ...BASE_AGENT_FEATURES, ...overrides };
}
export function supportsFeature(snapshot, feature) {
    return snapshot.features[feature];
}
export function hasGrantedCapability(snapshot, feature) {
    return snapshot.features[feature] === "supported" && snapshot.grantedPermissions?.[feature] === true;
}
//# sourceMappingURL=providers.js.map