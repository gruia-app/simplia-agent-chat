import type { ConformanceReport } from "simplia-agent-chat/core";
import { type AgentChatWorkspacePaneId } from "./AgentChatWorkspace.js";
export interface WorkspaceMarkupConformanceExpectation {
    readonly ariaLabel: string;
    readonly historyLabel: string;
    readonly layout: "home" | "work" | "mixed";
    readonly visiblePanes: readonly AgentChatWorkspacePaneId[];
    readonly workQueueLabel?: string | undefined;
    readonly workbenchLabel?: string | undefined;
    readonly nestedShell?: boolean | undefined;
    readonly textOnly?: boolean | undefined;
    readonly canary?: string | undefined;
}
export interface WorkspaceMarkupConformanceInput {
    readonly html: string;
    readonly expected: WorkspaceMarkupConformanceExpectation;
}
export interface SurfaceHostMarkupConformanceExpectation {
    readonly fallback?: boolean | undefined;
    readonly kind?: string | undefined;
    readonly canary?: string | undefined;
}
export interface SurfaceHostMarkupConformanceInput {
    readonly html: string;
    readonly expected: SurfaceHostMarkupConformanceExpectation;
}
export declare function runWorkspaceMarkupConformance(input: WorkspaceMarkupConformanceInput): ConformanceReport;
export declare function runSurfaceHostMarkupConformance(input: SurfaceHostMarkupConformanceInput): ConformanceReport;
//# sourceMappingURL=conformance.d.ts.map