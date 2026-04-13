import { useEffect, useRef, useState } from "react";
import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TPamResourceOption } from "./types/resource-options";
import { PamResourceType } from "./enums";
import {
  TListPamAccountsDTO,
  TListPamResourcesDTO,
  TPamAccount,
  TPamAccountDependency,
  TPamResource,
  TPamResourceDependency,
  TPamRotationRule,
  TPamSession,
  TPamSessionLogsPage
} from "./types";

export const pamKeys = {
  all: ["pam"] as const,
  resource: () => [...pamKeys.all, "resource"] as const,
  account: () => [...pamKeys.all, "account"] as const,
  session: () => [...pamKeys.all, "session"] as const,
  listResourceOptions: () => [...pamKeys.resource(), "options"] as const,
  listResources: ({ projectId, ...params }: TListPamResourcesDTO) => [
    ...pamKeys.resource(),
    "list",
    projectId,
    params
  ],
  getResource: (resourceType: string, resourceId: string) => [
    ...pamKeys.resource(),
    "get",
    resourceType,
    resourceId
  ],
  listRelatedResources: (resourceId: string) => [...pamKeys.resource(), "related", resourceId],
  allResourceDependencies: () => [...pamKeys.resource(), "dependencies"] as const,
  resourceDependencies: (resourceType: string, resourceId: string) => [
    ...pamKeys.resource(),
    "dependencies",
    resourceType,
    resourceId
  ],
  listAccounts: ({ projectId, ...params }: TListPamAccountsDTO) => [
    ...pamKeys.account(),
    "list",
    projectId,
    params
  ],
  getAccount: (accountId: string) => [...pamKeys.account(), "get", accountId],
  accountDependencies: (accountId: string) => [...pamKeys.account(), "dependencies", accountId],
  rotationRules: (resourceId: string) => [...pamKeys.resource(), "rotation-rules", resourceId],
  getSession: (sessionId: string) => [...pamKeys.session(), "get", sessionId],
  getSessionLogs: (sessionId: string) => [...pamKeys.session(), "logs", sessionId],
  listSessions: (projectId: string) => [...pamKeys.session(), "list", projectId],
  aiInsightsModels: () => [...pamKeys.all, "ai-insights-models"] as const
};

export type TPamAiInsightsModel = { connectionApp: string; id: string; label: string };

export const useGetPamAiInsightsModels = () => {
  return useQuery({
    queryKey: pamKeys.aiInsightsModels(),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ models: TPamAiInsightsModel[] }>(
        "/api/v1/pam/resources/ai-insights/models"
      );

      return data.models;
    }
  });
};

// Resources
export const useListPamResourceOptions = (
  options?: Omit<
    UseQueryOptions<
      TPamResourceOption[],
      unknown,
      TPamResourceOption[],
      ReturnType<typeof pamKeys.listResourceOptions>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: pamKeys.listResourceOptions(),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ resourceOptions: TPamResourceOption[] }>(
        "/api/v1/pam/resources/options"
      );

      return data.resourceOptions;
    },
    ...options
  });
};

type TListPamResourcesResponse = {
  resources: TPamResource[];
  totalCount: number;
};

export const useListPamResources = (
  params: TListPamResourcesDTO,
  options?: Omit<
    UseQueryOptions<
      TListPamResourcesResponse,
      unknown,
      TListPamResourcesResponse,
      ReturnType<typeof pamKeys.listResources>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: pamKeys.listResources(params),
    queryFn: async () => {
      const { metadataFilter, filterResourceTypes, ...rest } = params;
      const { data } = await apiRequest.post<TListPamResourcesResponse>(
        "/api/v1/pam/resources/search",
        {
          ...rest,
          metadata: metadataFilter,
          filterResourceTypes: filterResourceTypes
            ?.split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        }
      );

      return data;
    },
    placeholderData: (prev) => prev,
    ...options
  });
};

export const useGetPamResourceById = (
  resourceType?: PamResourceType,
  resourceId?: string,
  options?: Omit<
    UseQueryOptions<TPamResource, unknown, TPamResource, ReturnType<typeof pamKeys.getResource>>,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: pamKeys.getResource(resourceType || "", resourceId || ""),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ resource: TPamResource }>(
        `/api/v1/pam/resources/${resourceType}/${resourceId}`
      );

      return data.resource;
    },
    enabled: !!resourceId && !!resourceType && (options?.enabled ?? true),
    ...options
  });
};

export const useListRelatedResources = (
  resourceId?: string,
  options?: Omit<
    UseQueryOptions<
      TPamResource[],
      unknown,
      TPamResource[],
      ReturnType<typeof pamKeys.listRelatedResources>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: pamKeys.listRelatedResources(resourceId || ""),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ resources: TPamResource[] }>(
        `/api/v1/pam/resources/active-directory/${resourceId}/related-resources`
      );

      return data.resources;
    },
    enabled: !!resourceId && (options?.enabled ?? true),
    ...options
  });
};

export const useGetPamResourceDependencies = (
  resourceType?: PamResourceType,
  resourceId?: string
) => {
  return useQuery({
    queryKey: pamKeys.resourceDependencies(resourceType || "", resourceId || ""),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ dependencies: TPamResourceDependency[] }>(
        `/api/v1/pam/resources/${resourceType}/${resourceId}/dependencies`
      );
      return data.dependencies;
    },
    enabled: !!resourceType && !!resourceId
  });
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
      const { metadataFilter, filterResourceIds, ...rest } = params;
      const { data } = await apiRequest.post<TListPamAccountsResponse>(
        "/api/v1/pam/accounts/search",
        {
          ...rest,
          metadata: metadataFilter,
          filterResourceIds: filterResourceIds
            ?.split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        }
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

export const useGetPamAccountDependencies = (accountId?: string) => {
  return useQuery({
    queryKey: pamKeys.accountDependencies(accountId!),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ dependencies: TPamAccountDependency[] }>(
        `/api/v1/pam/accounts/${accountId}/dependencies`
      );
      return data.dependencies;
    },
    enabled: !!accountId
  });
};

export type TPamAccountCredentialsResponse = {
  credentials: Record<string, unknown>;
  resourceType: string;
  accountId: string;
  accountName: string;
  resourceName: string;
  projectId: string;
};

// Rotation Rules
export const useGetPamRotationRules = (resourceId?: string) => {
  return useQuery({
    queryKey: pamKeys.rotationRules(resourceId!),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ rules: TPamRotationRule[] }>(
        `/api/v1/pam/resources/${resourceId}/rotation-rules`
      );
      return data.rules;
    },
    enabled: !!resourceId
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

// Fetch batches until we have at least targetEventCount new events or no more batches remain.
// Returns the accumulated logs and updated cursor.
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

export const useGetPamSessionLogs = (sessionId: string, isActive: boolean) => {
  const [logs, setLogs] = useState<TPamSessionLogsPage["logs"]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const batchCursorRef = useRef(0);

  // Initial fetch: load up to LOGS_EVENT_PAGE_SIZE events for completed sessions,
  // or a single batch page for live sessions (polling handles the rest).
  useEffect(() => {
    if (!sessionId) return undefined;
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
  }, [sessionId, isActive]);

  // Live polling: advance cursor every 5s, catches up then tracks new batches
  useEffect(() => {
    if (!isActive || !sessionId) return undefined;

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
        // ignore transient errors — next tick will retry
      }
    }, LOGS_POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [sessionId, isActive]);

  // Load more: fetch the next LOGS_EVENT_PAGE_SIZE events (completed sessions only)
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
