import { type ChatEvent, type SurfaceBlock } from "./protocol.js";
import { type SurfacePlugin } from "./surfaces.js";
export type ConformanceSeverity = "error" | "warning";
export interface ConformanceCheck {
    readonly id: string;
    readonly description: string;
    readonly passed: boolean;
    readonly severity: ConformanceSeverity;
    readonly detail: string;
}
export interface ConformanceReport {
    readonly ok: boolean;
    readonly checks: readonly ConformanceCheck[];
}
export declare class ConformanceError extends Error {
    readonly report: ConformanceReport;
    constructor(report: ConformanceReport);
}
export declare function formatConformanceReport(report: ConformanceReport): string;
export declare function assertConformance(report: ConformanceReport): asserts report is ConformanceReport & {
    ok: true;
};
export interface SurfaceConformanceFixture {
    readonly plugin: SurfacePlugin;
    readonly validBlock: SurfaceBlock;
    readonly invalidBlock: SurfaceBlock;
    readonly payloadCanary: string;
    readonly actionId?: string | undefined;
    readonly nonJsonActionInput?: unknown;
}
export interface ReplayConformanceFixture {
    readonly events: readonly ChatEvent[];
    readonly malformedEvent: unknown;
    readonly unknownTypeEvent: unknown;
}
export interface CoreConformanceInput {
    readonly surfaces: readonly SurfaceConformanceFixture[];
    readonly replay?: ReplayConformanceFixture | undefined;
}
export declare function runCoreConformance(input: CoreConformanceInput): ConformanceReport;
//# sourceMappingURL=conformance.d.ts.map