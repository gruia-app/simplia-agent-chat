"use client";
import { applySurfaceActionReceipt, beginAbandonUnknownSurfaceAction, beginSurfaceAction, createSurfaceActionState, finishSurfaceActionAbandonmentUnknown, finishSurfaceActionReconciliationUnknown, isSurfaceActionBusy, markSurfaceActionUnknown, reconcileSurfaceAction, retrySurfaceAction, surfaceActionStatus, } from "simplia-agent-chat/core";
import { useCallback, useEffect, useRef, useState } from "react";
export function useSurfaceAction({ transport, initialState, }) {
    const [state, setState] = useState(() => createSurfaceActionState(initialState));
    const stateRef = useRef(state);
    const mountedRef = useRef(true);
    const transportRef = useRef(transport);
    const abortRef = useRef(null);
    transportRef.current = transport;
    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            abortRef.current?.abort();
            abortRef.current = null;
        };
    }, []);
    const publish = useCallback((next) => {
        stateRef.current = next;
        if (mountedRef.current)
            setState(next);
    }, []);
    const accept = useCallback((transition) => {
        if (!transition.accepted || transition.operationId === undefined)
            return undefined;
        publish(transition.state);
        return transition.operationId;
    }, [publish]);
    const executeTransition = useCallback(async (transition) => {
        const operationId = accept(transition);
        if (operationId === undefined)
            return false;
        const command = transition.state.command;
        const controller = new AbortController();
        abortRef.current = controller;
        try {
            const receipt = await transportRef.current.execute(command, { signal: controller.signal });
            publish(applySurfaceActionReceipt(stateRef.current, operationId, receipt));
        }
        catch {
            publish(markSurfaceActionUnknown(stateRef.current, operationId));
        }
        finally {
            if (abortRef.current === controller)
                abortRef.current = null;
        }
        return true;
    }, [accept, publish]);
    const execute = useCallback((command) => executeTransition(beginSurfaceAction(stateRef.current, command)), [executeTransition]);
    const retry = useCallback(() => executeTransition(retrySurfaceAction(stateRef.current)), [executeTransition]);
    const reconcile = useCallback(async () => {
        const transition = reconcileSurfaceAction(stateRef.current);
        const operationId = accept(transition);
        if (operationId === undefined)
            return false;
        const idempotencyKey = transition.state.command.idempotencyKey;
        const controller = new AbortController();
        abortRef.current = controller;
        try {
            const receipt = await transportRef.current.getReceipt(idempotencyKey, {
                signal: controller.signal,
            });
            publish(receipt
                ? applySurfaceActionReceipt(stateRef.current, operationId, receipt)
                : finishSurfaceActionReconciliationUnknown(stateRef.current, operationId));
        }
        catch {
            publish(finishSurfaceActionReconciliationUnknown(stateRef.current, operationId));
        }
        finally {
            if (abortRef.current === controller)
                abortRef.current = null;
        }
        return true;
    }, [accept, publish]);
    const abandonUnknown = useCallback(async (acknowledgePossibleEffects) => {
        const transition = beginAbandonUnknownSurfaceAction(stateRef.current, acknowledgePossibleEffects);
        const operationId = accept(transition);
        if (operationId === undefined)
            return false;
        const idempotencyKey = transition.state.command.idempotencyKey;
        const controller = new AbortController();
        abortRef.current = controller;
        try {
            const receipt = await transportRef.current.abandonUnknown(idempotencyKey, {
                acknowledgePossibleEffects: true,
                signal: controller.signal,
            });
            publish(applySurfaceActionReceipt(stateRef.current, operationId, receipt));
        }
        catch {
            publish(finishSurfaceActionAbandonmentUnknown(stateRef.current, operationId));
        }
        finally {
            if (abortRef.current === controller)
                abortRef.current = null;
        }
        return true;
    }, [accept, publish]);
    return {
        state,
        status: surfaceActionStatus(state),
        busy: isSurfaceActionBusy(state),
        execute,
        retry,
        reconcile,
        abandonUnknown,
    };
}
//# sourceMappingURL=use-surface-action.js.map