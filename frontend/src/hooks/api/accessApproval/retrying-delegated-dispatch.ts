import { useSyncExternalStore } from "react";

import { DelegatedApprovalRequestStatus } from "../delegatedApprovals/enums";

type RetryPhase = "awaiting-dispatch" | "dispatching";

const retries = new Map<string, RetryPhase>();
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
  retries.set(requestId, "awaiting-dispatch");
  emit();
};

export const isDelegatedDispatchRetrying = (requestId: string) => retries.has(requestId);

export const hasDelegatedDispatchRetries = () => retries.size > 0;

// A refetch can still return failed_dispatch until the consumer starts. That row is the
// failure the user just retried, so it must not clear the in-flight label.
export const noteDelegatedDispatchRetryStatuses = (
  requests: { id: string; status?: DelegatedApprovalRequestStatus | null }[]
) => {
  let changed = false;

  requests.forEach(({ id, status }) => {
    const phase = retries.get(id);
    if (!phase) return;

    if (!status) {
      retries.delete(id);
      changed = true;
      return;
    }

    if (phase === "awaiting-dispatch") {
      if (status === DelegatedApprovalRequestStatus.PendingDispatch) {
        retries.set(id, "dispatching");
        return;
      }
      if (status === DelegatedApprovalRequestStatus.FailedDispatch) return;

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
