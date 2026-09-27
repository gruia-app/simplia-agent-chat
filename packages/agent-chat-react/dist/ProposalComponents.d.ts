import { type ReactNode } from "react";
import { type AgentServerClient, type ByoPanelState, type ChatItem, type MemoryPanelState, type StructuredDiff } from "simplia-agent-chat/core";
export type Proposal = Awaited<ReturnType<AgentServerClient["listProposals"]>>[number];
/** Messages remain ordinary text; streamed fragments are only announced once complete. */
export declare function ChatLog({ items, label }: {
    items: readonly ChatItem[];
    label?: string;
}): import("react").JSX.Element;
/** Only the trusted StructuredDiff model is rendered, never Proposal.preview. */
export declare function ProposalDiff({ diff }: {
    diff: StructuredDiff;
}): import("react").JSX.Element;
export interface ProposalCardProps {
    proposal: Proposal;
    title?: string;
    effect?: "reversible" | "irreversible";
    diff?: StructuredDiff;
    costLabel?: string;
    undoUntil?: string;
    now?: Date;
    onAccept?: (proposal: Proposal) => void;
    onModify?: (proposal: Proposal) => void;
    onDiscard?: (proposal: Proposal) => void;
    onUndo?: (proposal: Proposal) => void;
}
export declare function ProposalCard({ proposal, title, effect, diff, costLabel, undoUntil, now, onAccept, onModify, onDiscard, onUndo }: ProposalCardProps): import("react").JSX.Element;
export interface IrreversibleDialogProps {
    open: boolean;
    title: string;
    description: string;
    onConfirm: () => void;
    onCancel: () => void;
    confirmLabel?: string;
}
export declare function IrreversibleDialog({ open, title, description, onConfirm, onCancel, confirmLabel }: IrreversibleDialogProps): import("react").JSX.Element | null;
export interface UndoToastProps {
    change: {
        change_id: string;
        applied_at: string;
        undo_window_s: number;
        undo_mode: "revert" | "compensate" | "none";
    };
    onUndo: (changeId: string) => void;
    now?: Date;
    message?: string;
}
export declare function UndoToast({ change, onUndo, now, message }: UndoToastProps): import("react").JSX.Element | null;
export interface PlanStep {
    id: string;
    label: string;
    status: "pending" | "current" | "completed" | "failed";
    proposal?: Proposal;
}
export declare function PlanSteps({ steps, onAcceptStep }: {
    steps: readonly PlanStep[];
    onAcceptStep?: (step: PlanStep, proposal: Proposal) => void;
}): import("react").JSX.Element;
export declare function MemoryPanel({ state, title }: {
    state: MemoryPanelState;
    title?: string;
}): import("react").JSX.Element;
export declare function BYOPanel({ state, title, actions }: {
    state: ByoPanelState;
    title?: string;
    actions?: ReactNode;
}): import("react").JSX.Element;
//# sourceMappingURL=ProposalComponents.d.ts.map