import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useSession } from "../auth/session";
import { createApiClient } from "./api";
import { applyDecision, InboxState, Store, StoreContext } from "./store";
import { Activity, ApprovalRequest } from "./types";

export const LiveStoreProvider = ({ instance, children }: { instance: string; children: ReactNode }) => {
  const { getAccessToken, refreshAccessToken, signOut } = useSession();
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [inbox, setInbox] = useState<InboxState>({ state: "loading" });
  const [refreshing, setRefreshing] = useState(false);
  const [activity, setActivity] = useState<Record<string, Activity>>({});
  const [resolvedThisSession, setResolved] = useState<Set<string>>(new Set());
  const resolved = useRef(resolvedThisSession);
  resolved.current = resolvedThisSession;

  const api = useMemo(
    () => createApiClient({ instance, getAccessToken, refreshAccessToken, onSessionEnded: (notice) => void signOut(notice) }),
    [instance, getAccessToken, refreshAccessToken, signOut]
  );

  const load = useCallback(async () => {
    try {
      const fetched = await api.listAwaitingReview();
      setRequests((prev) => [
        ...fetched.filter((request) => !resolved.current.has(request.id)),
        ...prev.filter((request) => resolved.current.has(request.id))
      ]);
      setInbox({ state: "ready" });
    } catch (error) {
      setInbox({ state: "error", error: error instanceof Error ? error.message : "Something went wrong loading your requests." });
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const decide = useCallback(
    async (id: string, action: "approve" | "deny", comment?: string) => {
      setActivity((prev) => ({ ...prev, [id]: { state: action === "approve" ? "approving" : "denying" } }));
      try {
        await api.decide(id, action, comment);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Your decision wasn't recorded. Try again.";
        setActivity((prev) => ({ ...prev, [id]: { state: "failed", action, error: message } }));
        return false;
      }
      setRequests((prev) => prev.map((request) => (request.id === id ? applyDecision(request, action, comment) : request)));
      setResolved((prev) => new Set(prev).add(id));
      setActivity((prev) => ({ ...prev, [id]: { state: "idle" } }));
      return true;
    },
    [api]
  );

  const value = useMemo<Store>(
    () => ({
      organizationName: "Infisical",
      requests,
      inbox,
      refreshing,
      refresh,
      activity,
      decide,
      resolvedThisSession,
      historyComplete: false
    }),
    [requests, inbox, refreshing, refresh, activity, decide, resolvedThisSession]
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
};
