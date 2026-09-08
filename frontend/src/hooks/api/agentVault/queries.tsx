import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { useOrganization } from "@app/context";

import {
  TAgentVaultAccessBundleDetails,
  TAgentVaultAccessBundleListItem,
  TAgentVaultProductIdentityMember,
  TAgentVaultProxy,
  TAgentVaultSession,
  TListAgentVaultSessionsDTO
} from "./types";

export const fetchAgentVaultProjectId = async () => {
  const { data } = await apiRequest.get<{ projectId: string }>("/api/v1/agent-vault/project");
  return data.projectId;
};

// Every key carries the org, because Agent Vault is org-scoped through the JWT rather than through a
// path parameter: without it a switch to another org would serve the previous org's data from cache.
export const agentVaultKeys = {
  all: (orgId: string) => ["agent-vault", orgId] as const,
  accessBundles: (orgId: string) => [...agentVaultKeys.all(orgId), "access-bundles"] as const,
  accessBundle: (orgId: string, accessBundleId: string) =>
    [...agentVaultKeys.accessBundles(orgId), accessBundleId] as const,
  // sessions() is the invalidation prefix; folding the parameters in would put an `undefined` in it,
  // which prefix-matches nothing.
  sessions: (orgId: string) => [...agentVaultKeys.all(orgId), "sessions"] as const,
  sessionList: (orgId: string, params?: TListAgentVaultSessionsDTO) =>
    [...agentVaultKeys.sessions(orgId), params] as const,
  proxies: (orgId: string) => [...agentVaultKeys.all(orgId), "proxies"] as const,
  productIdentities: (orgId: string) =>
    [...agentVaultKeys.all(orgId), "product-identities"] as const,
  productMembers: (orgId: string) => [...agentVaultKeys.all(orgId), "product-members"] as const,
  productIdentityMembers: (orgId: string) =>
    [...agentVaultKeys.productMembers(orgId), "identities"] as const
};

const fetchProductMembers = async <T,>(path: string) => {
  const { data } = await apiRequest.get<{ members: T[] }>(
    `/api/v1/agent-vault/memberships/${path}`
  );
  return data.members;
};

export const useListAgentVaultProductIdentityMembers = () => {
  const { currentOrg } = useOrganization();

  return useQuery({
    queryKey: agentVaultKeys.productIdentityMembers(currentOrg.id),
    queryFn: () => fetchProductMembers<TAgentVaultProductIdentityMember>("identity-members")
  });
};

export const useListAgentVaultProductIdentities = (enabled = true) => {
  const { currentOrg } = useOrganization();

  return useQuery({
    queryKey: agentVaultKeys.productIdentities(currentOrg.id),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ identities: { id: string; name: string }[] }>(
        "/api/v1/agent-vault/memberships/identities"
      );
      return data.identities;
    },
    enabled
  });
};

export const useListAgentVaultAccessBundles = () => {
  const { currentOrg } = useOrganization();

  return useQuery({
    queryKey: agentVaultKeys.accessBundles(currentOrg.id),
    queryFn: async () => {
      const { data } = await apiRequest.get<{
        accessBundles: TAgentVaultAccessBundleListItem[];
      }>("/api/v1/agent-vault/access-bundles");
      return data.accessBundles;
    }
  });
};

export const useGetAgentVaultAccessBundle = (accessBundleId: string) => {
  const { currentOrg } = useOrganization();

  return useQuery({
    queryKey: agentVaultKeys.accessBundle(currentOrg.id, accessBundleId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ accessBundle: TAgentVaultAccessBundleDetails }>(
        `/api/v1/agent-vault/access-bundles/${accessBundleId}`
      );
      return data.accessBundle;
    },
    enabled: Boolean(accessBundleId)
  });
};

export const useListAgentVaultSessions = (params?: TListAgentVaultSessionsDTO) => {
  const { currentOrg } = useOrganization();

  return useQuery({
    queryKey: agentVaultKeys.sessionList(currentOrg.id, params),
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
};

export const useListAgentVaultProxies = () => {
  const { currentOrg } = useOrganization();

  return useQuery({
    queryKey: agentVaultKeys.proxies(currentOrg.id),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ proxies: TAgentVaultProxy[] }>(
        "/api/v1/agent-vault/proxies"
      );
      return data.proxies;
    },
    refetchInterval: 30_000
  });
};
