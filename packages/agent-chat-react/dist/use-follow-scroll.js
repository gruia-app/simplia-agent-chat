"use client";
import { useCallback, useLayoutEffect, useRef, useState, } from "react";
export function useFollowScroll(contentVersion, threshold = 72) {
    const containerRef = useRef(null);
    const modeRef = useRef("following-end");
    const [mode, setMode] = useState("following-end");
    const updateMode = useCallback((next) => {
        if (modeRef.current === next)
            return;
        modeRef.current = next;
        setMode(next);
    }, []);
    const onScroll = useCallback((event) => {
        const viewport = event.currentTarget;
        const distance = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
        updateMode(distance <= threshold ? "following-end" : "free-scrolling");
    }, [threshold, updateMode]);
    const scrollToEnd = useCallback((behavior = "smooth") => {
        updateMode("following-end");
        const viewport = containerRef.current;
        if (viewport)
            viewport.scrollTo({ top: viewport.scrollHeight, behavior });
    }, [updateMode]);
    useLayoutEffect(() => {
        if (modeRef.current !== "following-end")
            return;
        const viewport = containerRef.current;
        if (viewport)
            viewport.scrollTo({ top: viewport.scrollHeight, behavior: "auto" });
    }, [contentVersion]);
    return { containerRef, mode, onScroll, scrollToEnd };
}
//# sourceMappingURL=use-follow-scroll.js.map