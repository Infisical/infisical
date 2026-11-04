import { createContext, ReactNode, useCallback, useContext, useMemo, useRef, useState } from "react";

import { buildFixtures } from "./fixtures";
import { Activity, ApprovalRequest } from "./types";

type Store = {
  requests: ApprovalRequest[];
  activity: Record<string, Activity>;
  decide: (id: string, action: "approve" | "deny", comment?: string) => Promise<boolean>;
  undo: (id: string) => void;
  resolvedThisSession: Set<string>;
};

const StoreContext = createContext<Store | null>(null);

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const FLAKY_REQUEST_ID = "c7a0f3b2-1e5d-4a8f-b9c4-2f6d7e8a9b03";

export const StoreProvider = ({ children }: { children: ReactNode }) => {
  const [requests, setRequests] = useState(() => buildFixtures(Date.now()));
  const [activity, setActivity] = useState<Record<string, Activity>>({});
  const [resolvedThisSession, setResolved] = useState<Set<string>>(new Set());
  const attempts = useRef<Record<string, number>>({});

  const decide = useCallback(async (id: string, action: "approve" | "deny", comment?: string) => {
    setActivity((prev) => ({ ...prev, [id]: { state: action === "approve" ? "approving" : "denying" } }));
    await wait(900);
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
    setRequests((prev) =>
      prev.map((request) =>
        request.id === id
          ? {
              ...request,
              status: action === "approve" ? "approved" : "rejected",
              awaitingYou: false,
              decision: { by: "You", at: Date.now(), comment: comment || undefined },
              steps: request.steps.map((step) =>
                step.status === "current"
                  ? { ...step, status: action === "approve" ? "approved" : "rejected", decidedBy: "You" }
                  : step
              )
            }
          : request
      )
    );
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

  const value = useMemo(
    () => ({ requests, activity, decide, undo, resolvedThisSession }),
    [requests, activity, decide, undo, resolvedThisSession]
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
};

export const useStore = () => {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useStore must be used inside StoreProvider");
  return store;
};
