import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TPamResourceOption } from "./types/resource-options";
import { PamResourceType } from "./enums";
import {
  TListPamAccountsDTO,
  TListPamResourcesDTO,
  TPamAccount,
  TPamFolder,
  TPamResource,
  TPamSession,
  TPamSessionHealth
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
  listAccounts: ({ projectId, ...params }: TListPamAccountsDTO) => [
    ...pamKeys.account(),
    "list",
    projectId,
    params
  ],
  getSession: (sessionId: string) => [...pamKeys.session(), "get", sessionId],
  listSessions: (projectId: string) => [...pamKeys.session(), "list", projectId],
  sessionHealth: (sessionId: string) => [...pamKeys.session(), "health", sessionId] as const
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
      const { data } = await apiRequest.get<TListPamResourcesResponse>("/api/v1/pam/resources", {
        params
      });

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

// Accounts
type TListPamAccountsResponse = {
  accounts: TPamAccount[];
  folders: TPamFolder[];
  totalCount: number;
  folderId?: string;
  folderPaths: Record<string, string>;
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
      const { data } = await apiRequest.get<TListPamAccountsResponse>("/api/v1/pam/accounts", {
        params
      });

      return data;
    },
    placeholderData: (prev) => prev,
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

// Browser session health check
export const useCheckSessionHealth = (
  sessionId: string,
  options?: Omit<
    UseQueryOptions<
      TPamSessionHealth,
      unknown,
      TPamSessionHealth,
      ReturnType<typeof pamKeys.sessionHealth>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: pamKeys.sessionHealth(sessionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TPamSessionHealth>(
        `/api/v1/pam/accounts/session/${sessionId}/health`
      );
      return data;
    },
    enabled: !!sessionId,
    refetchInterval: 30000, // Poll every 30 seconds
    refetchIntervalInBackground: false,
    retry: false, // Don't retry health checks
    ...options
  });
};
