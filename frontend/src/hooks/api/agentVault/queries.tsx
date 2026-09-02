import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import {
  TAgentVaultAccessBundleDetails,
  TAgentVaultAccessBundleListItem,
  TAgentVaultProxy,
  TAgentVaultSession,
  TListAgentVaultSessionsDTO
} from "./types";

// Resolves the org's Agent Vault project, creating it on first access (lazy bootstrap on the backend).
export const fetchAgentVaultProjectId = async () => {
  const { data } = await apiRequest.get<{ projectId: string }>("/api/v1/agent-vault/project");
  return data.projectId;
};

export const agentVaultKeys = {
  all: ["agent-vault"] as const,
  accessBundles: () => [...agentVaultKeys.all, "access-bundles"] as const,
  accessBundle: (accessBundleId: string) =>
    [...agentVaultKeys.accessBundles(), accessBundleId] as const,
  liveSessionCount: (accessBundleId: string) =>
    [...agentVaultKeys.accessBundle(accessBundleId), "live-session-count"] as const,
  sessions: (params?: TListAgentVaultSessionsDTO) =>
    [...agentVaultKeys.all, "sessions", params] as const,
  proxies: () => [...agentVaultKeys.all, "proxies"] as const
};

export const useListAgentVaultAccessBundles = () =>
  useQuery({
    queryKey: agentVaultKeys.accessBundles(),
    queryFn: async () => {
      const { data } = await apiRequest.get<{
        accessBundles: TAgentVaultAccessBundleListItem[];
      }>("/api/v1/agent-vault/access-bundles");
      return data.accessBundles;
    }
  });

export const useGetAgentVaultAccessBundle = (accessBundleId: string) =>
  useQuery({
    queryKey: agentVaultKeys.accessBundle(accessBundleId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ accessBundle: TAgentVaultAccessBundleDetails }>(
        `/api/v1/agent-vault/access-bundles/${accessBundleId}`
      );
      return data.accessBundle;
    },
    enabled: Boolean(accessBundleId)
  });

export const useGetAgentVaultAccessBundleLiveSessionCount = (
  accessBundleId: string,
  enabled = true
) =>
  useQuery({
    queryKey: agentVaultKeys.liveSessionCount(accessBundleId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ liveSessionCount: number }>(
        `/api/v1/agent-vault/access-bundles/${accessBundleId}/live-session-count`
      );
      return data.liveSessionCount;
    },
    enabled: enabled && Boolean(accessBundleId)
  });

export const useListAgentVaultSessions = (params?: TListAgentVaultSessionsDTO) =>
  useQuery({
    queryKey: agentVaultKeys.sessions(params),
    queryFn: async () => {
      const { data } = await apiRequest.get<{
        sessions: TAgentVaultSession[];
        totalCount: number;
      }>("/api/v1/agent-vault/sessions", { params });
      return data;
    },
    refetchInterval: 30_000,
    placeholderData: (prev) => prev
  });

export const useListAgentVaultProxies = () =>
  useQuery({
    queryKey: agentVaultKeys.proxies(),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ proxies: TAgentVaultProxy[] }>(
        "/api/v1/agent-vault/proxies"
      );
      return data.proxies;
    },
    refetchInterval: 30_000
  });
