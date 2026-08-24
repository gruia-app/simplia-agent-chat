import type { ProviderConnectionSummary, ProviderDefinition, ProviderModelDefinition } from "simplia-agent-chat/core/providers";
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
export declare function ProviderAccountPicker({ providers, connections, models, selectedConnectionId, selectedModelId, accountLabel, modelLabel, connectLabel, unavailableLabel, disabled, onSelectionChange, onConnect, }: ProviderAccountPickerProps): import("react").JSX.Element;
//# sourceMappingURL=ProviderAccountPicker.d.ts.map