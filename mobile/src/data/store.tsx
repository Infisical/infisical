import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { buildFixtures, ORGANIZATION } from "./fixtures";
import { Activity, ApprovalRequest } from "./types";

export type InboxState = { state: "loading" } | { state: "ready" } | { state: "error"; error: string };

export type Store = {
  organizationName: string;
  requests: ApprovalRequest[];
  inbox: InboxState;
  refreshing: boolean;
  refresh: () => Promise<void>;
  activity: Record<string, Activity>;
  decide: (id: string, action: "approve" | "deny", comment?: string) => Promise<boolean>;
  undo?: (id: string) => void;
  resolvedThisSession: Set<string>;
  historyComplete: boolean;
};

export const StoreContext = createContext<Store | null>(null);

export const applyDecision = (request: ApprovalRequest, action: "approve" | "deny", comment?: string): ApprovalRequest => ({
  ...request,
  status: action === "approve" ? "approved" : "rejected",
  awaitingYou: false,
  decision: { by: "You", at: Date.now(), comment: comment || undefined },
  steps: request.steps.map((step) =>
    step.status === "current" ? { ...step, status: action === "approve" ? "approved" : "rejected", decidedBy: "You" } : step
  )
});

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isPastExpiry = (request: ApprovalRequest) => request.expiresAt !== undefined && request.expiresAt <= Date.now();

const FLAKY_REQUEST_ID = "c7a0f3b2-1e5d-4a8f-b9c4-2f6d7e8a9b03";

export const DemoStoreProvider = ({ children }: { children: ReactNode }) => {
  const [requests, setRequests] = useState(() => buildFixtures(Date.now()));
  const [activity, setActivity] = useState<Record<string, Activity>>({});
  const [resolvedThisSession, setResolved] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);
  const attempts = useRef<Record<string, number>>({});
  const latest = useRef(requests);
  latest.current = requests;

  useEffect(() => {
    const expire = () =>
      setRequests((prev) =>
        prev.some((request) => request.status === "pending" && isPastExpiry(request))
          ? prev.map((request) =>
              request.status === "pending" && isPastExpiry(request) ? { ...request, status: "expired", awaitingYou: false } : request
            )
          : prev
      );
    expire();
    const timer = setInterval(expire, 30 * 1000);
    return () => clearInterval(timer);
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await wait(700);
    setRefreshing(false);
  }, []);

  const decide = useCallback(async (id: string, action: "approve" | "deny", comment?: string) => {
    setActivity((prev) => ({ ...prev, [id]: { state: action === "approve" ? "approving" : "denying" } }));
    await wait(900);
    const target = latest.current.find((request) => request.id === id);
    if (!target || target.status !== "pending" || isPastExpiry(target)) {
      setActivity((prev) => ({
        ...prev,
        [id]: { state: "failed", action, error: "This request expired before your decision was recorded, so nothing changed." }
      }));
      return false;
    }
    attempts.current[id] = (attempts.current[id] ?? 0) + 1;
    if (id === FLAKY_REQUEST_ID && attempts.current[id] === 1) {
      setActivity((prev) => ({
        ...prev,
        [id]: {
          state: "failed",
          action,
          error: "Infisical couldn't reach Acme Intermediate CA, so the request is still open. Try again in a moment."
        }
      }));
      return false;
    }
    setRequests((prev) => prev.map((request) => (request.id === id ? applyDecision(request, action, comment) : request)));
    setResolved((prev) => new Set(prev).add(id));
    setActivity((prev) => ({ ...prev, [id]: { state: "idle" } }));
    return true;
  }, []);

  const undo = useCallback((id: string) => {
    setRequests((prev) =>
      prev.map((request) =>
        request.id === id
          ? {
              ...request,
              status: "pending",
              awaitingYou: true,
              decision: undefined,
              steps: request.steps.map((step) =>
                step.decidedBy === "You" ? { ...step, status: "current", decidedBy: undefined } : step
              )
            }
          : request
      )
    );
  }, []);

  const value = useMemo<Store>(
    () => ({
      organizationName: ORGANIZATION,
      requests,
      inbox: { state: "ready" },
      refreshing,
      refresh,
      activity,
      decide,
      undo,
      resolvedThisSession,
      historyComplete: true
    }),
    [requests, refreshing, refresh, activity, decide, undo, resolvedThisSession]
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
};

export const useStore = () => {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useStore must be used inside a store provider");
  return store;
};
