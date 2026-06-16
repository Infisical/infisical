import { useEffect, useRef, useState } from "react";
import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
  UseQueryOptions
} from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import {
  createResourcePermissionQueryHook,
  ResourcePermissionResponse
} from "@app/helpers/resourcePermissions";

import {
  PamFolderPermissionSet,
  TAccessiblePamAccount,
  TListAccessiblePamAccountsDTO,
  TListPamAccountsDTO,
  TPamAccount,
  TPamSession,
  TPamSessionLogsPage
} from "./types";

export const pamKeys = {
  all: ["pam"] as const,
  account: () => [...pamKeys.all, "account"] as const,
  session: () => [...pamKeys.all, "session"] as const,
  accessibleFolders: () => [...pamKeys.account(), "accessible-folders"] as const,
  listAccounts: ({ projectId, ...params }: TListPamAccountsDTO) => [
    ...pamKeys.account(),
    "list",
    projectId,
    params
  ],
  listAccessibleAccounts: (params?: TListAccessiblePamAccountsDTO) => [
    ...pamKeys.account(),
    "accessible",
    params
  ],
  getAccount: (accountId: string) => [...pamKeys.account(), "get", accountId],
  getSession: (sessionId: string) => [...pamKeys.session(), "get", sessionId],
  listSessions: (
    projectId: string,
    params?: { offset?: number; limit?: number; search?: string; status?: string }
  ) => [...pamKeys.session(), "list", projectId, params],
  folderPermissions: (folderId: string) =>
    [...pamKeys.all, "folder-permissions", folderId] as const,
  accountPermissions: (accountId: string) =>
    [...pamKeys.all, "account-permissions", accountId] as const
};

const fetchFolderPermissions = async (folderId: string) => {
  const { data } = await apiRequest.get<{
    data: ResourcePermissionResponse<PamFolderPermissionSet>;
  }>(`/api/v1/pam/folders/${folderId}/permissions`);
  return data.data;
};

export const usePamFolderPermission = createResourcePermissionQueryHook<PamFolderPermissionSet>({
  queryKey: (folderId) => pamKeys.folderPermissions(folderId),
  fetchFn: fetchFolderPermissions
});

const fetchAccountPermissions = async (accountId: string) => {
  const { data } = await apiRequest.get<{
    data: ResourcePermissionResponse<PamFolderPermissionSet>;
  }>(`/api/v1/pam/accounts/${accountId}/permissions`);
  return data.data;
};

export const usePamAccountPermission = createResourcePermissionQueryHook<PamFolderPermissionSet>({
  queryKey: (accountId) => pamKeys.accountPermissions(accountId),
  fetchFn: fetchAccountPermissions
});

// Accessible Accounts (user-facing)
type TListAccessiblePamAccountsResponse = {
  accounts: TAccessiblePamAccount[];
  totalCount: number;
};

const ACCESSIBLE_ACCOUNTS_PAGE_SIZE = 50;

export const useListAccessiblePamAccounts = (
  filters?: Omit<TListAccessiblePamAccountsDTO, "offset" | "limit">
) => {
  return useInfiniteQuery({
    queryKey: pamKeys.listAccessibleAccounts(filters),
    queryFn: async ({ pageParam = 0 }) => {
      const { data } = await apiRequest.get<TListAccessiblePamAccountsResponse>(
        "/api/v1/pam/accounts/accessible",
        { params: { ...filters, offset: pageParam, limit: ACCESSIBLE_ACCOUNTS_PAGE_SIZE } }
      );
      return data;
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const fetched = allPages.reduce((sum, p) => sum + p.accounts.length, 0);
      return fetched < lastPage.totalCount ? fetched : undefined;
    },
    placeholderData: keepPreviousData
  });
};

// Accessible Folders (user-facing)
type TAccessiblePamFolder = {
  id: string;
  name: string;
  accountCount: number;
};

export const useListAccessiblePamFolders = () => {
  return useQuery({
    queryKey: pamKeys.accessibleFolders(),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ folders: TAccessiblePamFolder[] }>(
        "/api/v1/pam/folders"
      );
      return data.folders;
    }
  });
};

// Accounts (admin)
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
      const { data } = await apiRequest.get<{ account: TPamAccount }>(
        `/api/v1/pam/accounts/${accountId}`
      );

      return data.account;
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

type TListPamSessionsResponse = {
  sessions: TPamSession[];
  totalCount: number;
};

export const useListPamSessions = (
  projectId: string,
  params?: { offset?: number; limit?: number; search?: string; status?: string }
) => {
  return useQuery({
    queryKey: pamKeys.listSessions(projectId, params),
    queryFn: async () => {
      const { data } = await apiRequest.get<TListPamSessionsResponse>("/api/v1/pam/sessions", {
        params: { projectId, ...params }
      });

      return data;
    },
    placeholderData: (prev) => prev
  });
};
