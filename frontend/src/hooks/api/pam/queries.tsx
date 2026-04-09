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
  listSessions: (projectId: string) => [...pamKeys.session(), "list", projectId]
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

const LOGS_FETCH_LIMIT = 100;
const LOGS_POLL_INTERVAL_MS = 5000;

export const useGetPamSessionLogs = (sessionId: string, isActive: boolean) => {
  const [logs, setLogs] = useState<TPamSessionLogsPage["logs"]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const batchCursorRef = useRef(0);

  // Initial load: auto-paginate until all existing batches are fetched
  useEffect(() => {
    if (!sessionId) return undefined;
    let cancelled = false;

    const fetchAll = async () => {
      setIsLoading(true);
      let offset = 0;
      const allLogs: TPamSessionLogsPage["logs"] = [];

      try {
        let hasMore = true;
        while (hasMore) {
          if (cancelled) return;
          // eslint-disable-next-line no-await-in-loop
          const { data } = await apiRequest.get<TPamSessionLogsPage>(
            `/api/v1/pam/sessions/${sessionId}/logs`,
            { params: { offset, limit: LOGS_FETCH_LIMIT } }
          );
          allLogs.push(...data.logs);
          offset += data.batchCount;
          hasMore = data.hasMore;
        }
      } catch {
        // ignore — leave logs as whatever was fetched so far
      }

      if (!cancelled) {
        batchCursorRef.current = offset;
        setLogs(allLogs);
        setIsLoading(false);
      }
    };

    fetchAll().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  // Polling: only fetch new batches (offset = cursor)
  useEffect(() => {
    if (!isActive || !sessionId) return undefined;

    const interval = setInterval(async () => {
      try {
        const { data } = await apiRequest.get<TPamSessionLogsPage>(
          `/api/v1/pam/sessions/${sessionId}/logs`,
          { params: { offset: batchCursorRef.current, limit: LOGS_FETCH_LIMIT } }
        );

        if (data.batchCount > 0) {
          batchCursorRef.current += data.batchCount;
          setLogs((prev) => [...prev, ...data.logs]);
        }
      } catch {
        // ignore transient errors — next tick will retry
      }
    }, LOGS_POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [sessionId, isActive]);

  return { logs, isLoading };
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
