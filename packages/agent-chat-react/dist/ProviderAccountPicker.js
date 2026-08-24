import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useId } from "react";
function connectionOptionLabel(connection) {
    const identity = connection.identity?.email
        ?? connection.identity?.displayName
        ?? connection.identity?.organization;
    return identity ? `${connection.label} (${identity})` : connection.label;
}
export function ProviderAccountPicker({ providers, connections, models, selectedConnectionId, selectedModelId, accountLabel = "Provider account", modelLabel = "Model", connectLabel = "Connect provider", unavailableLabel = "Reconnect required", disabled = false, onSelectionChange, onConnect, }) {
    const accountId = useId();
    const modelId = useId();
    const selectedConnection = connections.find((connection) => connection.id === selectedConnectionId);
    const availableModels = selectedConnection
        ? models.filter((model) => model.providerId === selectedConnection.providerId)
        : [];
    const selectedProvider = selectedConnection
        ? providers.find((provider) => provider.id === selectedConnection.providerId)
        : undefined;
    const connected = connections.filter((connection) => connection.status !== "disabled");
    return (_jsxs("div", { className: "sac-provider-picker", "data-sac-provider-picker": "true", children: [_jsxs("div", { className: "sac-provider-field", children: [_jsx("label", { htmlFor: accountId, children: accountLabel }), _jsxs("select", { id: accountId, value: selectedConnectionId ?? "", disabled: disabled || connected.length === 0, onChange: (event) => {
                            const connection = connections.find((candidate) => candidate.id === event.target.value);
                            if (!connection)
                                return;
                            const defaultModel = models.find((model) => model.providerId === connection.providerId && model.isDefault) ?? models.find((model) => model.providerId === connection.providerId);
                            onSelectionChange({
                                connectionId: connection.id,
                                providerId: connection.providerId,
                                ...(defaultModel ? { modelId: defaultModel.id } : {}),
                            });
                        }, children: [connected.length === 0 ? _jsx("option", { value: "", children: unavailableLabel }) : null, connected.map((connection) => (_jsx("option", { value: connection.id, children: connectionOptionLabel(connection) }, connection.id)))] }), selectedConnection && selectedConnection.status !== "connected" ? (_jsx("span", { className: "sac-provider-status", role: "status", children: selectedConnection.statusReason || unavailableLabel })) : null] }), _jsxs("div", { className: "sac-provider-field", children: [_jsx("label", { htmlFor: modelId, children: modelLabel }), _jsx("select", { id: modelId, value: selectedModelId ?? "", disabled: disabled || !selectedConnection || availableModels.length === 0, onChange: (event) => {
                            if (!selectedConnection)
                                return;
                            onSelectionChange({
                                connectionId: selectedConnection.id,
                                providerId: selectedConnection.providerId,
                                modelId: event.target.value,
                            });
                        }, children: availableModels.map((model) => (_jsx("option", { value: model.id, children: model.displayName }, model.id))) })] }), _jsx("button", { type: "button", className: "sac-button sac-provider-connect", disabled: disabled, onClick: () => onConnect(selectedProvider?.id), children: connectLabel })] }));
}
//# sourceMappingURL=ProviderAccountPicker.js.map