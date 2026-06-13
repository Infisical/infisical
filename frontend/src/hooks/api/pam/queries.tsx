import { useEffect, useRef, useState } from "react";
import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TListPamAccountsDTO, TPamAccount, TPamSession, TPamSessionLogsPage } from "./types";

export const pamKeys = {
  all: ["pam"] as const,
  account: () => [...pamKeys.all, "account"] as const,
  session: () => [...pamKeys.all, "session"] as const,
  listAccounts: ({ projectId, ...params }: TListPamAccountsDTO) => [
    ...pamKeys.account(),
    "list",
    projectId,
    params
  ],
  getAccount: (accountId: string) => [...pamKeys.account(), "get", accountId],
  getSession: (sessionId: string) => [...pamKeys.session(), "get", sessionId],
  listSessions: (projectId: string) => [...pamKeys.session(), "list", projectId]
};

// Accounts
type TListPamAccountsResponse = {
  accounts: TPamAccount[];
  totalCount: number;
};

export const useListPamAccounts = (
  params: TListPamAccountsDTO,
  options?: Omit<
    UseQueryOptions<
      TListPamAccountsResponse,
      unknown,
      TListPamAccountsResponse,
      ReturnType<typeof pamKeys.listAccounts>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: pamKeys.listAccounts(params),
    queryFn: async () => {
      const { data } = await apiRequest.post<TListPamAccountsResponse>(
        "/api/v1/pam/accounts/search",
        params
      );

      return data;
    },
    placeholderData: (prev) => prev,
    ...options
  });
};

export const useGetPamAccountById = (
  accountId?: string,
  options?: Omit<
    UseQueryOptions<TPamAccount, unknown, TPamAccount, ReturnType<typeof pamKeys.getAccount>>,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: pamKeys.getAccount(accountId || ""),
    queryFn: async () => {
      const { data } = await apiRequest.get<TPamAccount>(`/api/v1/pam/accounts/${accountId}`);

      return data;
    },
    enabled: !!accountId && (options?.enabled ?? true),
    ...options
  });
};

// Sessions
export const useGetPamSessionById = (
  sessionId: string,
  options?: Omit<
    UseQueryOptions<TPamSession, unknown, TPamSession, ReturnType<typeof pamKeys.getSession>>,
    "queryKey" | "queryFn" | "enabled"
  >
) => {
  return useQuery({
    queryKey: pamKeys.getSession(sessionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ session: TPamSession }>(
        `/api/v1/pam/sessions/${sessionId}`
      );

      return data.session;
    },
    enabled: !!sessionId,
    ...options
  });
};

const LOGS_BATCH_FETCH_SIZE = 100;
const LOGS_EVENT_PAGE_SIZE = 1000;
const LOGS_POLL_INTERVAL_MS = 5000;

const fetchUntilEventTarget = async (
  sessionId: string,
  startCursor: number,
  targetEventCount: number
) => {
  let cursor = startCursor;
  let totalEvents = 0;
  let hasMore = false;
  const accumulatedLogs: TPamSessionLogsPage["logs"] = [];

  do {
    // eslint-disable-next-line no-await-in-loop
    const { data } = await apiRequest.get<TPamSessionLogsPage>(
      `/api/v1/pam/sessions/${sessionId}/logs`,
      { params: { offset: cursor, limit: LOGS_BATCH_FETCH_SIZE } }
    );
    accumulatedLogs.push(...data.logs);
    cursor += data.batchCount;
    totalEvents += data.logs.length;
    hasMore = data.hasMore;
  } while (hasMore && totalEvents < targetEventCount);

  return { logs: accumulatedLogs, cursor, hasMore };
};

export const useGetPamSessionLogs = (sessionId: string, isActive: boolean, enabled: boolean) => {
  const [logs, setLogs] = useState<TPamSessionLogsPage["logs"]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const batchCursorRef = useRef(0);

  useEffect(() => {
    if (!enabled || !sessionId) return undefined;
    let cancelled = false;

    const fetchInitial = async () => {
      setIsLoading(true);
      batchCursorRef.current = 0;
      try {
        const targetEvents = isActive ? 0 : LOGS_EVENT_PAGE_SIZE;
        const result = await fetchUntilEventTarget(sessionId, 0, targetEvents);
        if (!cancelled) {
          setLogs(result.logs);
          batchCursorRef.current = result.cursor;
          setHasMore(result.hasMore);
        }
      } catch {
        // ignore
      }
      if (!cancelled) setIsLoading(false);
    };

    fetchInitial().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [sessionId, isActive, enabled]);

  useEffect(() => {
    if (!enabled || !isActive || !sessionId) return undefined;

    const interval = setInterval(async () => {
      try {
        const { data } = await apiRequest.get<TPamSessionLogsPage>(
          `/api/v1/pam/sessions/${sessionId}/logs`,
          { params: { offset: batchCursorRef.current, limit: LOGS_BATCH_FETCH_SIZE } }
        );
        if (data.batchCount > 0) {
          batchCursorRef.current += data.batchCount;
          setLogs((prev) => [...prev, ...data.logs]);
          setHasMore(data.hasMore);
        }
      } catch {
        // ignore transient errors
      }
    }, LOGS_POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [sessionId, isActive, enabled]);

  const loadMore = async () => {
    setIsLoadingMore(true);
    try {
      const result = await fetchUntilEventTarget(
        sessionId,
        batchCursorRef.current,
        LOGS_EVENT_PAGE_SIZE
      );
      batchCursorRef.current = result.cursor;
      setLogs((prev) => [...prev, ...result.logs]);
      setHasMore(result.hasMore);
    } catch {
      // ignore
    }
    setIsLoadingMore(false);
  };

  return { logs, isLoading, hasMore, loadMore, isLoadingMore };
};

export const useListPamSessions = (
  projectId: string,
  options?: Omit<
    UseQueryOptions<TPamSession[], unknown, TPamSession[], ReturnType<typeof pamKeys.listSessions>>,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: pamKeys.listSessions(projectId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ sessions: TPamSession[] }>("/api/v1/pam/sessions", {
        params: { projectId }
      });

      return data.sessions;
    },
    ...options
  });
};
