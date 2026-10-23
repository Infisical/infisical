import { useSyncExternalStore } from "react";

import { DelegatedApprovalRequestStatus } from "../delegatedApprovals/enums";

type RetryPhase = "awaiting-dispatch" | "dispatching";

const DISPATCH_PICKUP_WINDOW_MS = 30_000;
const RETRY_TRACKING_TTL_MS = 120_000;

const retries = new Map<string, { phase: RetryPhase; markedAt: number }>();
const listeners = new Set<() => void>();
let version = 0;

const emit = () => {
  version += 1;
  listeners.forEach((listener) => listener());
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const markDelegatedDispatchRetry = (requestId: string) => {
  retries.set(requestId, { phase: "awaiting-dispatch", markedAt: Date.now() });
  emit();
};

export const isDelegatedDispatchRetrying = (requestId: string) => retries.has(requestId);

// A refetch can still return failed_dispatch until the consumer starts. That row is the
// failure the user just retried, so it must not clear the in-flight label.
export const noteDelegatedDispatchRetryStatuses = (
  requests: { id: string; status?: DelegatedApprovalRequestStatus | null }[]
) => {
  const now = Date.now();
  let changed = false;

  retries.forEach((retry, id) => {
    if (now - retry.markedAt < RETRY_TRACKING_TTL_MS) return;
    retries.delete(id);
    changed = true;
  });

  requests.forEach(({ id, status }) => {
    const retry = retries.get(id);
    if (!retry) return;

    if (!status) {
      retries.delete(id);
      changed = true;
      return;
    }

    if (retry.phase === "awaiting-dispatch") {
      if (status === DelegatedApprovalRequestStatus.PendingDispatch) {
        retries.set(id, { ...retry, phase: "dispatching" });
        return;
      }
      const isAwaitingPickup = now - retry.markedAt < DISPATCH_PICKUP_WINDOW_MS;
      if (status === DelegatedApprovalRequestStatus.FailedDispatch && isAwaitingPickup) return;

      retries.delete(id);
      changed = true;
      return;
    }

    if (status !== DelegatedApprovalRequestStatus.PendingDispatch) {
      retries.delete(id);
      changed = true;
    }
  });

  if (changed) emit();
};

export const useDelegatedDispatchRetryVersion = () =>
  useSyncExternalStore(
    subscribe,
    () => version,
    () => 0
  );

export const useIsDelegatedDispatchRetrying = (requestId: string) =>
  useSyncExternalStore(
    subscribe,
    () => retries.has(requestId),
    () => false
  );
