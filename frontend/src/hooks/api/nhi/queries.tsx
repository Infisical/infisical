import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TNhiIdentity, TNhiRecommendedAction, TNhiRemediationAction, TNhiScan, TNhiSource, TNhiStats } from "./types";

export const nhiKeys = {
  all: ["nhi"] as const,
  stats: (projectId: string) => [...nhiKeys.all, "stats", projectId] as const,
  sources: (projectId: string) => [...nhiKeys.all, "sources", projectId] as const,
  identities: (projectId: string, filters?: Record<string, unknown>) =>
    [...nhiKeys.all, "identities", projectId, filters] as const,
  identityById: (identityId: string) => [...nhiKeys.all, "identity", identityId] as const,
  scans: (sourceId: string) => [...nhiKeys.all, "scans", sourceId] as const,
  scanById: (scanId: string) => [...nhiKeys.all, "scan", scanId] as const,
  recommendedActions: (identityId: string) => [...nhiKeys.all, "recommended-actions", identityId] as const,
  remediationActions: (identityId: string) => [...nhiKeys.all, "remediation-actions", identityId] as const
};

export const useGetNhiStats = (
  projectId: string,
  options?: Omit<
    UseQueryOptions<TNhiStats, unknown, TNhiStats, ReturnType<typeof nhiKeys.stats>>,
    "queryKey" | "queryFn"
  >
) =>
  useQuery({
    queryKey: nhiKeys.stats(projectId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TNhiStats>("/api/v1/nhi/stats", {
        params: { projectId }
      });
      return data;
    },
    ...options
  });

export const useListNhiSources = (
  projectId: string,
  options?: Omit<
    UseQueryOptions<TNhiSource[], unknown, TNhiSource[], ReturnType<typeof nhiKeys.sources>>,
    "queryKey" | "queryFn"
  >
) =>
  useQuery({
    queryKey: nhiKeys.sources(projectId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ sources: TNhiSource[] }>("/api/v1/nhi/sources", {
        params: { projectId }
      });
      return data.sources;
    },
    ...options
  });

export const useListNhiIdentities = (
  {
    projectId,
    search,
    riskLevel,
    type,
    sourceId,
    provider,
    status,
    ownerFilter,
    page = 1,
    limit = 50,
    sortBy = "riskScore",
    sortDir = "desc"
  }: {
    projectId: string;
    search?: string;
    riskLevel?: string;
    type?: string;
    sourceId?: string;
    provider?: string;
    status?: string;
    ownerFilter?: string;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortDir?: "asc" | "desc";
  },
  options?: Omit<
    UseQueryOptions<
      { identities: TNhiIdentity[]; totalCount: number },
      unknown,
      { identities: TNhiIdentity[]; totalCount: number },
      ReturnType<typeof nhiKeys.identities>
    >,
    "queryKey" | "queryFn"
  >
) =>
  useQuery({
    queryKey: nhiKeys.identities(projectId, {
      search,
      riskLevel,
      type,
      sourceId,
      provider,
      status,
      ownerFilter,
      page,
      limit,
      sortBy,
      sortDir
    }),
    queryFn: async () => {
      const { data } = await apiRequest.get<{
        identities: TNhiIdentity[];
        totalCount: number;
      }>("/api/v1/nhi/identities", {
        params: {
          projectId,
          ...(search && { search }),
          ...(riskLevel && { riskLevel }),
          ...(type && { type }),
          ...(sourceId && { sourceId }),
          ...(provider && { provider }),
          ...(status && { status }),
          ...(ownerFilter && { ownerFilter }),
          page,
          limit,
          sortBy,
          sortDir
        }
      });
      return data;
    },
    ...options
  });

export const useGetNhiIdentity = (
  { identityId, projectId }: { identityId: string; projectId: string },
  options?: Omit<
    UseQueryOptions<TNhiIdentity, unknown, TNhiIdentity, ReturnType<typeof nhiKeys.identityById>>,
    "queryKey" | "queryFn"
  >
) =>
  useQuery({
    queryKey: nhiKeys.identityById(identityId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ identity: TNhiIdentity }>(
        `/api/v1/nhi/identities/${identityId}`,
        { params: { projectId } }
      );
      return data.identity;
    },
    ...options
  });

export const useListNhiScans = (
  { sourceId, projectId }: { sourceId: string; projectId: string },
  options?: Omit<
    UseQueryOptions<TNhiScan[], unknown, TNhiScan[], ReturnType<typeof nhiKeys.scans>>,
    "queryKey" | "queryFn"
  >
) =>
  useQuery({
    queryKey: nhiKeys.scans(sourceId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ scans: TNhiScan[] }>(
        `/api/v1/nhi/sources/${sourceId}/scans`,
        { params: { projectId } }
      );
      return data.scans;
    },
    ...options
  });

export const useGetNhiScan = (
  { scanId, projectId }: { scanId: string; projectId: string },
  options?: Omit<
    UseQueryOptions<TNhiScan, unknown, TNhiScan, ReturnType<typeof nhiKeys.scanById>>,
    "queryKey" | "queryFn"
  >
) =>
  useQuery({
    queryKey: nhiKeys.scanById(scanId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ scan: TNhiScan }>(`/api/v1/nhi/scans/${scanId}`, {
        params: { projectId }
      });
      return data.scan;
    },
    ...options
  });

export const useGetRecommendedActions = (
  { identityId, projectId }: { identityId: string; projectId: string },
  options?: Omit<
    UseQueryOptions<
      TNhiRecommendedAction[],
      unknown,
      TNhiRecommendedAction[],
      ReturnType<typeof nhiKeys.recommendedActions>
    >,
    "queryKey" | "queryFn"
  >
) =>
  useQuery({
    queryKey: nhiKeys.recommendedActions(identityId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ actions: TNhiRecommendedAction[] }>(
        `/api/v1/nhi/identities/${identityId}/recommended-actions`,
        { params: { projectId } }
      );
      return data.actions;
    },
    ...options
  });

export const useListRemediationActions = (
  { identityId, projectId }: { identityId: string; projectId: string },
  options?: Omit<
    UseQueryOptions<
      TNhiRemediationAction[],
      unknown,
      TNhiRemediationAction[],
      ReturnType<typeof nhiKeys.remediationActions>
    >,
    "queryKey" | "queryFn"
  >
) =>
  useQuery({
    queryKey: nhiKeys.remediationActions(identityId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ actions: TNhiRemediationAction[] }>(
        `/api/v1/nhi/identities/${identityId}/remediation-actions`,
        { params: { projectId } }
      );
      return data.actions;
    },
    ...options
  });
