import { surfaceActionStatus, type SurfaceActionCommand, type SurfaceActionState, type SurfaceActionTransport } from "simplia-agent-chat/core";
export interface UseSurfaceActionOptions {
    transport: SurfaceActionTransport;
    initialState?: Pick<SurfaceActionState, "command" | "receipt" | "abandonedUnknown">;
}
export interface SurfaceActionController {
    state: SurfaceActionState;
    status: ReturnType<typeof surfaceActionStatus>;
    busy: boolean;
    execute(command: SurfaceActionCommand): Promise<boolean>;
    retry(): Promise<boolean>;
    reconcile(): Promise<boolean>;
    abandonUnknown(acknowledgePossibleEffects: boolean): Promise<boolean>;
}
export declare function useSurfaceAction({ transport, initialState, }: UseSurfaceActionOptions): SurfaceActionController;
//# sourceMappingURL=use-surface-action.d.ts.map