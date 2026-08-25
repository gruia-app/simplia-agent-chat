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
  reasoningEffort?: string;
  verbosity?: string;
}

export interface ProviderAccountPickerProps {
  providers: readonly ProviderDefinition[];
  connections: readonly ProviderConnectionSummary[];
  models: readonly ProviderModelDefinition[];
  selectedConnectionId?: string;
  selectedModelId?: string;
  selectedReasoningEffort?: string;
  selectedVerbosity?: string;
  accountLabel?: string;
  modelLabel?: string;
  reasoningEffortLabel?: string;
  verbosityLabel?: string;
  providerDefaultLabel?: string;
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
  selectedReasoningEffort,
  selectedVerbosity,
  accountLabel = "Provider account",
  modelLabel = "Model",
  reasoningEffortLabel = "Reasoning effort",
  verbosityLabel = "Verbosity",
  providerDefaultLabel = "Provider default",
  connectLabel = "Connect provider",
  unavailableLabel = "Reconnect required",
  disabled = false,
  onSelectionChange,
  onConnect,
}: ProviderAccountPickerProps) {
  const accountId = useId();
  const modelId = useId();
  const connected = connections.filter((connection) => connection.status !== "disabled");
  const selectedConnection = connected.find(
    (connection) => connection.id === selectedConnectionId,
  ) ?? connected.find((connection) => connection.isDefault) ?? connected[0];
  const availableModels = selectedConnection
    ? models.filter((model) => (
      model.providerId === selectedConnection.providerId
      && (!model.connectionId || model.connectionId === selectedConnection.id)
    ))
    : [];
  const selectedModel = availableModels.find((model) => model.id === selectedModelId)
    ?? availableModels.find((model) => model.isDefault)
    ?? availableModels[0];
  const selectedProvider = selectedConnection
    ? providers.find((provider) => provider.id === selectedConnection.providerId)
    : undefined;

  return (
    <div className="sac-provider-picker" data-sac-provider-picker="true">
      <div className="sac-provider-field">
        <label htmlFor={accountId}>{accountLabel}</label>
        <select
          id={accountId}
          value={selectedConnection?.id ?? ""}
          disabled={disabled || connected.length === 0}
          onChange={(event) => {
            const connection = connections.find((candidate) => candidate.id === event.target.value);
            if (!connection) return;
            const defaultModel = models.find(
              (model) => model.providerId === connection.providerId
                && (!model.connectionId || model.connectionId === connection.id)
                && model.isDefault,
            ) ?? models.find((model) => (
              model.providerId === connection.providerId
              && (!model.connectionId || model.connectionId === connection.id)
            ));
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
          value={selectedModel?.id ?? ""}
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

      {selectedModel?.reasoningEfforts?.length ? (
        <div className="sac-provider-field">
          <label htmlFor={`${modelId}-reasoning`}>{reasoningEffortLabel}</label>
          <select
            id={`${modelId}-reasoning`}
            value={selectedReasoningEffort ?? ""}
            disabled={disabled}
            onChange={(event) => {
              if (!selectedConnection || !selectedModel) return;
              onSelectionChange({
                connectionId: selectedConnection.id,
                providerId: selectedConnection.providerId,
                modelId: selectedModel.id,
                ...(event.target.value ? { reasoningEffort: event.target.value } : {}),
                ...(selectedVerbosity ? { verbosity: selectedVerbosity } : {}),
              });
            }}
          >
            <option value="">{providerDefaultLabel}</option>
            {selectedModel.reasoningEfforts.map((effort) => (
              <option key={effort} value={effort}>{effort}</option>
            ))}
          </select>
        </div>
      ) : null}

      {selectedModel?.verbosityLevels?.length ? (
        <div className="sac-provider-field">
          <label htmlFor={`${modelId}-verbosity`}>{verbosityLabel}</label>
          <select
            id={`${modelId}-verbosity`}
            value={selectedVerbosity ?? ""}
            disabled={disabled}
            onChange={(event) => {
              if (!selectedConnection || !selectedModel) return;
              onSelectionChange({
                connectionId: selectedConnection.id,
                providerId: selectedConnection.providerId,
                modelId: selectedModel.id,
                ...(selectedReasoningEffort ? { reasoningEffort: selectedReasoningEffort } : {}),
                ...(event.target.value ? { verbosity: event.target.value } : {}),
              });
            }}
          >
            <option value="">{providerDefaultLabel}</option>
            {selectedModel.verbosityLevels.map((verbosity) => (
              <option key={verbosity} value={verbosity}>{verbosity}</option>
            ))}
          </select>
        </div>
      ) : null}

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
