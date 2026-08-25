import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useId } from "react";
function connectionOptionLabel(connection) {
    const identity = connection.identity?.email
        ?? connection.identity?.displayName
        ?? connection.identity?.organization;
    return identity ? `${connection.label} (${identity})` : connection.label;
}
export function ProviderAccountPicker({ providers, connections, models, selectedConnectionId, selectedModelId, selectedReasoningEffort, selectedVerbosity, accountLabel = "Provider account", modelLabel = "Model", reasoningEffortLabel = "Reasoning effort", verbosityLabel = "Verbosity", providerDefaultLabel = "Provider default", connectLabel = "Connect provider", unavailableLabel = "Reconnect required", disabled = false, onSelectionChange, onConnect, }) {
    const accountId = useId();
    const modelId = useId();
    const connected = connections.filter((connection) => connection.status !== "disabled");
    const selectedConnection = connected.find((connection) => connection.id === selectedConnectionId) ?? connected.find((connection) => connection.isDefault) ?? connected[0];
    const availableModels = selectedConnection
        ? models.filter((model) => model.providerId === selectedConnection.providerId)
        : [];
    const selectedModel = availableModels.find((model) => model.id === selectedModelId)
        ?? availableModels.find((model) => model.isDefault)
        ?? availableModels[0];
    const selectedProvider = selectedConnection
        ? providers.find((provider) => provider.id === selectedConnection.providerId)
        : undefined;
    return (_jsxs("div", { className: "sac-provider-picker", "data-sac-provider-picker": "true", children: [_jsxs("div", { className: "sac-provider-field", children: [_jsx("label", { htmlFor: accountId, children: accountLabel }), _jsxs("select", { id: accountId, value: selectedConnection?.id ?? "", disabled: disabled || connected.length === 0, onChange: (event) => {
                            const connection = connections.find((candidate) => candidate.id === event.target.value);
                            if (!connection)
                                return;
                            const defaultModel = models.find((model) => model.providerId === connection.providerId && model.isDefault) ?? models.find((model) => model.providerId === connection.providerId);
                            onSelectionChange({
                                connectionId: connection.id,
                                providerId: connection.providerId,
                                ...(defaultModel ? { modelId: defaultModel.id } : {}),
                            });
                        }, children: [connected.length === 0 ? _jsx("option", { value: "", children: unavailableLabel }) : null, connected.map((connection) => (_jsx("option", { value: connection.id, children: connectionOptionLabel(connection) }, connection.id)))] }), selectedConnection && selectedConnection.status !== "connected" ? (_jsx("span", { className: "sac-provider-status", role: "status", children: selectedConnection.statusReason || unavailableLabel })) : null] }), _jsxs("div", { className: "sac-provider-field", children: [_jsx("label", { htmlFor: modelId, children: modelLabel }), _jsx("select", { id: modelId, value: selectedModel?.id ?? "", disabled: disabled || !selectedConnection || availableModels.length === 0, onChange: (event) => {
                            if (!selectedConnection)
                                return;
                            onSelectionChange({
                                connectionId: selectedConnection.id,
                                providerId: selectedConnection.providerId,
                                modelId: event.target.value,
                            });
                        }, children: availableModels.map((model) => (_jsx("option", { value: model.id, children: model.displayName }, model.id))) })] }), selectedModel?.reasoningEfforts?.length ? (_jsxs("div", { className: "sac-provider-field", children: [_jsx("label", { htmlFor: `${modelId}-reasoning`, children: reasoningEffortLabel }), _jsxs("select", { id: `${modelId}-reasoning`, value: selectedReasoningEffort ?? "", disabled: disabled, onChange: (event) => {
                            if (!selectedConnection || !selectedModel)
                                return;
                            onSelectionChange({
                                connectionId: selectedConnection.id,
                                providerId: selectedConnection.providerId,
                                modelId: selectedModel.id,
                                ...(event.target.value ? { reasoningEffort: event.target.value } : {}),
                                ...(selectedVerbosity ? { verbosity: selectedVerbosity } : {}),
                            });
                        }, children: [_jsx("option", { value: "", children: providerDefaultLabel }), selectedModel.reasoningEfforts.map((effort) => (_jsx("option", { value: effort, children: effort }, effort)))] })] })) : null, selectedModel?.verbosityLevels?.length ? (_jsxs("div", { className: "sac-provider-field", children: [_jsx("label", { htmlFor: `${modelId}-verbosity`, children: verbosityLabel }), _jsxs("select", { id: `${modelId}-verbosity`, value: selectedVerbosity ?? "", disabled: disabled, onChange: (event) => {
                            if (!selectedConnection || !selectedModel)
                                return;
                            onSelectionChange({
                                connectionId: selectedConnection.id,
                                providerId: selectedConnection.providerId,
                                modelId: selectedModel.id,
                                ...(selectedReasoningEffort ? { reasoningEffort: selectedReasoningEffort } : {}),
                                ...(event.target.value ? { verbosity: event.target.value } : {}),
                            });
                        }, children: [_jsx("option", { value: "", children: providerDefaultLabel }), selectedModel.verbosityLevels.map((verbosity) => (_jsx("option", { value: verbosity, children: verbosity }, verbosity)))] })] })) : null, _jsx("button", { type: "button", className: "sac-button sac-provider-connect", disabled: disabled, onClick: () => onConnect(selectedProvider?.id), children: connectLabel })] }));
}
//# sourceMappingURL=ProviderAccountPicker.js.map