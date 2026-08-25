import type { ProviderConnectionSummary, ProviderDefinition, ProviderModelDefinition } from "simplia-agent-chat/core/providers";
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
export declare function ProviderAccountPicker({ providers, connections, models, selectedConnectionId, selectedModelId, selectedReasoningEffort, selectedVerbosity, accountLabel, modelLabel, reasoningEffortLabel, verbosityLabel, providerDefaultLabel, connectLabel, unavailableLabel, disabled, onSelectionChange, onConnect, }: ProviderAccountPickerProps): import("react").JSX.Element;
//# sourceMappingURL=ProviderAccountPicker.d.ts.map