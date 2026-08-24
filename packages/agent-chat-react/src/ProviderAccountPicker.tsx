import { useId } from "react";
import type {
  ProviderConnectionSummary,
  ProviderDefinition,
  ProviderModelDefinition,
} from "simplia-agent-chat/core/providers";

export interface ProviderSelection {
  connectionId: string;
  providerId: string;
  modelId?: string;
}

export interface ProviderAccountPickerProps {
  providers: readonly ProviderDefinition[];
  connections: readonly ProviderConnectionSummary[];
  models: readonly ProviderModelDefinition[];
  selectedConnectionId?: string;
  selectedModelId?: string;
  accountLabel?: string;
  modelLabel?: string;
  connectLabel?: string;
  unavailableLabel?: string;
  disabled?: boolean;
  onSelectionChange(selection: ProviderSelection): void;
  onConnect(providerId?: string): void;
}

function connectionOptionLabel(connection: ProviderConnectionSummary): string {
  const identity = connection.identity?.email
    ?? connection.identity?.displayName
    ?? connection.identity?.organization;
  return identity ? `${connection.label} (${identity})` : connection.label;
}

export function ProviderAccountPicker({
  providers,
  connections,
  models,
  selectedConnectionId,
  selectedModelId,
  accountLabel = "Provider account",
  modelLabel = "Model",
  connectLabel = "Connect provider",
  unavailableLabel = "Reconnect required",
  disabled = false,
  onSelectionChange,
  onConnect,
}: ProviderAccountPickerProps) {
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

  return (
    <div className="sac-provider-picker" data-sac-provider-picker="true">
      <div className="sac-provider-field">
        <label htmlFor={accountId}>{accountLabel}</label>
        <select
          id={accountId}
          value={selectedConnectionId ?? ""}
          disabled={disabled || connected.length === 0}
          onChange={(event) => {
            const connection = connections.find((candidate) => candidate.id === event.target.value);
            if (!connection) return;
            const defaultModel = models.find(
              (model) => model.providerId === connection.providerId && model.isDefault,
            ) ?? models.find((model) => model.providerId === connection.providerId);
            onSelectionChange({
              connectionId: connection.id,
              providerId: connection.providerId,
              ...(defaultModel ? { modelId: defaultModel.id } : {}),
            });
          }}
        >
          {connected.length === 0 ? <option value="">{unavailableLabel}</option> : null}
          {connected.map((connection) => (
            <option key={connection.id} value={connection.id}>
              {connectionOptionLabel(connection)}
            </option>
          ))}
        </select>
        {selectedConnection && selectedConnection.status !== "connected" ? (
          <span className="sac-provider-status" role="status">
            {selectedConnection.statusReason || unavailableLabel}
          </span>
        ) : null}
      </div>

      <div className="sac-provider-field">
        <label htmlFor={modelId}>{modelLabel}</label>
        <select
          id={modelId}
          value={selectedModelId ?? ""}
          disabled={disabled || !selectedConnection || availableModels.length === 0}
          onChange={(event) => {
            if (!selectedConnection) return;
            onSelectionChange({
              connectionId: selectedConnection.id,
              providerId: selectedConnection.providerId,
              modelId: event.target.value,
            });
          }}
        >
          {availableModels.map((model) => (
            <option key={model.id} value={model.id}>{model.displayName}</option>
          ))}
        </select>
      </div>

      <button
        type="button"
        className="sac-button sac-provider-connect"
        disabled={disabled}
        onClick={() => onConnect(selectedProvider?.id)}
      >
        {connectLabel}
      </button>
    </div>
  );
}
