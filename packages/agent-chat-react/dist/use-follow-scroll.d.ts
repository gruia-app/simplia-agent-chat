import { type RefObject, type UIEventHandler } from "react";
export type FollowScrollMode = "following-end" | "free-scrolling";
export interface FollowScrollController {
    containerRef: RefObject<HTMLDivElement | null>;
    mode: FollowScrollMode;
    onScroll: UIEventHandler<HTMLDivElement>;
    scrollToEnd: (behavior?: ScrollBehavior) => void;
}
export declare function useFollowScroll(contentVersion: string | number, threshold?: number): FollowScrollController;
//# sourceMappingURL=use-follow-scroll.d.ts.map