import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TPamResourceOption } from "./types/resource-options";
import { PamResourceType } from "./enums";
import {
  TMcpServerConfiguration,
  TMcpServerTool,
  TPamAccount,
  TPamFolder,
  TPamResource,
  TPamSession
} from "./types";

export const pamKeys = {
  all: ["pam"] as const,
  resource: () => [...pamKeys.all, "resource"] as const,
  account: () => [...pamKeys.all, "account"] as const,
  session: () => [...pamKeys.all, "session"] as const,
  mcp: () => [...pamKeys.all, "mcp"] as const,
  listResourceOptions: () => [...pamKeys.resource(), "options"] as const,
  listResources: (projectId: string) => [...pamKeys.resource(), "list", projectId],
  getResource: (resourceType: string, resourceId: string) => [
    ...pamKeys.resource(),
    "get",
    resourceType,
    resourceId
  ],
  listAccounts: (projectId: string) => [...pamKeys.account(), "list", projectId],
  getSession: (sessionId: string) => [...pamKeys.session(), "get", sessionId],
  listSessions: (projectId: string) => [...pamKeys.session(), "list", projectId],
  getMcpConfig: (accountId: string) => [...pamKeys.mcp(), "config", accountId],
  getMcpTools: (accountId: string) => [...pamKeys.mcp(), "tools", accountId],
  mcpOauthAuthorize: (accountId: string) => [...pamKeys.account(), "oauth-authorize", accountId]
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

export const useListPamResources = (
  projectId: string,
  options?: Omit<
    UseQueryOptions<
      TPamResource[],
      unknown,
      TPamResource[],
      ReturnType<typeof pamKeys.listResources>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: pamKeys.listResources(projectId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ resources: TPamResource[] }>(
        "/api/v1/pam/resources",
        { params: { projectId } }
      );

      return data.resources;
    },
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
export const useListPamAccounts = (
  projectId: string,
  options?: Omit<
    UseQueryOptions<
      { accounts: TPamAccount[]; folders: TPamFolder[] },
      unknown,
      { accounts: TPamAccount[]; folders: TPamFolder[] },
      ReturnType<typeof pamKeys.listAccounts>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: pamKeys.listAccounts(projectId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ accounts: TPamAccount[]; folders: TPamFolder[] }>(
        "/api/v1/pam/accounts",
        { params: { projectId } }
      );

      return data;
    },
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

// MCP Server
export const useGetMcpServerConfig = (
  accountId?: string,
  options?: Omit<
    UseQueryOptions<
      TMcpServerConfiguration,
      unknown,
      TMcpServerConfiguration,
      ReturnType<typeof pamKeys.getMcpConfig>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: pamKeys.getMcpConfig(accountId || ""),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ config: TMcpServerConfiguration }>(
        `/api/v1/pam/accounts/mcp/${accountId}/config`
      );

      return data.config;
    },
    enabled: !!accountId && (options?.enabled ?? true),
    ...options
  });
};

export const useGetMcpServerTools = (
  accountId?: string,
  options?: Omit<
    UseQueryOptions<
      TMcpServerTool[],
      unknown,
      TMcpServerTool[],
      ReturnType<typeof pamKeys.getMcpTools>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: pamKeys.getMcpTools(accountId || ""),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ tools: TMcpServerTool[] }>(
        `/api/v1/pam/accounts/mcp/${accountId}/tools`
      );

      return data.tools;
    },
    enabled: !!accountId && (options?.enabled ?? true),
    ...options
  });
};

export const useMcpServerOAuthAuthorize = (accountId: string) => {
  return useQuery({
    queryKey: pamKeys.mcpOauthAuthorize(accountId || ""),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ authUrl: string }>(
        `/api/v1/pam/accounts/mcp/${accountId}/oauth/authorize`
      );

      window.location.assign(data.authUrl);
    }
  });
};
