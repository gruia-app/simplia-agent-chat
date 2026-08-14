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