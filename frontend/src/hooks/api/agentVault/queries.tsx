import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import {
  TAgentVaultAccessBundleDetails,
  TAgentVaultAccessBundleListItem,
  TAgentVaultProductIdentityMember,
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
  // sessions() is the invalidation prefix; sessionList() adds the query parameters. Folding the
  // parameters into one key would put an `undefined` in the prefix, which prefix-matches nothing.
  sessions: () => [...agentVaultKeys.all, "sessions"] as const,
  sessionList: (params?: TListAgentVaultSessionsDTO) =>
    [...agentVaultKeys.sessions(), params] as const,
  proxies: () => [...agentVaultKeys.all, "proxies"] as const,
  productIdentities: () => [...agentVaultKeys.all, "product-identities"] as const,
  productMembers: () => [...agentVaultKeys.all, "product-members"] as const,
  productIdentityMembers: () => [...agentVaultKeys.productMembers(), "identities"] as const
};

const fetchProductMembers = async <T,>(path: string) => {
  const { data } = await apiRequest.get<{ members: T[] }>(
    `/api/v1/agent-vault/memberships/${path}`
  );
  return data.members;
};

export const useListAgentVaultProductIdentityMembers = () =>
  useQuery({
    queryKey: agentVaultKeys.productIdentityMembers(),
    queryFn: () => fetchProductMembers<TAgentVaultProductIdentityMember>("identity-members")
  });

// Every identity member rather than a page: the grant picker filters client-side, so a paginated
// list would leave search unable to find one it never fetched.
export const useListAgentVaultProductIdentities = (enabled = true) =>
  useQuery({
    queryKey: agentVaultKeys.productIdentities(),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ identities: { id: string; name: string }[] }>(
        "/api/v1/agent-vault/memberships/identities"
      );
      return data.identities;
    },
    enabled
  });

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

export const useListAgentVaultSessions = (params?: TListAgentVaultSessionsDTO) =>
  useQuery({
    queryKey: agentVaultKeys.sessionList(params),
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
