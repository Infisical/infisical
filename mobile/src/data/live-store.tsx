import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useSession } from "../auth/session";
import { createApiClient } from "./api";
import { applyDecision, InboxState, Store, StoreContext } from "./store";
import { Activity, ApprovalRequest } from "./types";

type Props = { instance: string; generation: number; children: ReactNode };

export const LiveStoreProvider = ({ instance, generation, children }: Props) => {
  const { getAccessToken, refreshAccessToken, endSession } = useSession();
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [inbox, setInbox] = useState<InboxState>({ state: "loading" });
  const [refreshing, setRefreshing] = useState(false);
  const [activity, setActivity] = useState<Record<string, Activity>>({});
  const [resolvedThisSession, setResolved] = useState<Set<string>>(new Set());
  const focused = useRef<string | null>(null);
  const deciding = useRef(new Set<string>());

  const api = useMemo(
    () =>
      createApiClient({
        instance,
        getAccessToken: () => getAccessToken(generation),
        refreshAccessToken: () => refreshAccessToken(generation),
        onSessionEnded: (notice) => endSession(generation, notice)
      }),
    [instance, generation, getAccessToken, refreshAccessToken, endSession]
  );

  const load = useCallback(async () => {
    const startedAt = Date.now();
    try {
      const fetched = await api.listAwaitingReview();
      setRequests((prev) => {
        const previous = new Map(prev.map((request) => [request.id, request]));
        const keepLocal = (request: ApprovalRequest) =>
          deciding.current.has(request.id) || (request.decision?.by === "You" && request.decision.at >= startedAt);
        const merged = fetched.map((request) => {
          const local = previous.get(request.id);
          if (!local) return request;
          if (keepLocal(local)) return local;
          return local.decision?.by === "You" ? { ...request, decision: local.decision } : request;
        });
        const fetchedIds = new Set(fetched.map((request) => request.id));
        const kept = prev
          .filter(
            (request) =>
              !fetchedIds.has(request.id) &&
              (request.decision?.by === "You" || deciding.current.has(request.id) || request.id === focused.current)
          )
          .map((request) =>
            request.awaitingYou && !deciding.current.has(request.id)
              ? { ...request, awaitingYou: false, leftQueue: true }
              : request
          );
        return [...merged, ...kept];
      });
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
      deciding.current.add(id);
      try {
        const status = await api.decide(id, action, comment);
        setRequests((prev) => prev.map((request) => (request.id === id ? applyDecision(request, action, comment, status) : request)));
        setResolved((prev) => new Set(prev).add(id));
        setActivity((prev) => ({ ...prev, [id]: { state: "idle" } }));
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Your decision wasn't recorded. Try again.";
        setActivity((prev) => ({ ...prev, [id]: { state: "failed", action, error: message } }));
        return false;
      } finally {
        deciding.current.delete(id);
      }
    },
    [api]
  );

  const focus = useCallback((id: string | null) => {
    focused.current = id;
  }, []);

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
      historyComplete: false,
      focus
    }),
    [requests, inbox, refreshing, refresh, activity, decide, resolvedThisSession, focus]
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
};
