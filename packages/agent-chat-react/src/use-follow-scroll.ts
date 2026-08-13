"use client";

import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
  type UIEventHandler,
} from "react";

export type FollowScrollMode = "following-end" | "free-scrolling";

export interface FollowScrollController {
  containerRef: RefObject<HTMLDivElement | null>;
  mode: FollowScrollMode;
  onScroll: UIEventHandler<HTMLDivElement>;
  scrollToEnd: (behavior?: ScrollBehavior) => void;
}

export function useFollowScroll(contentVersion: string | number, threshold = 72): FollowScrollController {
  const containerRef = useRef<HTMLDivElement>(null);
  const modeRef = useRef<FollowScrollMode>("following-end");
  const [mode, setMode] = useState<FollowScrollMode>("following-end");

  const updateMode = useCallback((next: FollowScrollMode) => {
    if (modeRef.current === next) return;
    modeRef.current = next;
    setMode(next);
  }, []);

  const onScroll = useCallback<UIEventHandler<HTMLDivElement>>(
    (event) => {
      const viewport = event.currentTarget;
      const distance = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
      updateMode(distance <= threshold ? "following-end" : "free-scrolling");
    },
    [threshold, updateMode],
  );

  const scrollToEnd = useCallback(
    (behavior: ScrollBehavior = "smooth") => {
      updateMode("following-end");
      const viewport = containerRef.current;
      if (viewport) viewport.scrollTo({ top: viewport.scrollHeight, behavior });
    },
    [updateMode],
  );

  useLayoutEffect(() => {
    if (modeRef.current !== "following-end") return;
    const viewport = containerRef.current;
    if (viewport) viewport.scrollTo({ top: viewport.scrollHeight, behavior: "auto" });
  }, [contentVersion]);

  return { containerRef, mode, onScroll, scrollToEnd };
}
