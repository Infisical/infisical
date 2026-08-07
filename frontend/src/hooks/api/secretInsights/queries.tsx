import { useInfiniteQuery, useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import {
  TGetAuthMethodDistributionDTO,
  TGetAuthMethodDistributionResponse,
  TGetCalendarInsightsDTO,
  TGetCalendarInsightsResponse,
  TGetInsightsCountsDTO,
  TGetInsightsCountsResponse,
  TGetInsightsSummaryDTO,
  TGetInsightsSummaryResponse,
  TGetOrgSecretsProjectsDTO,
  // TGetSecretAccessLocationsDTO,
  // TGetSecretAccessLocationsResponse,
  TGetSecretAccessVolumeDTO,
  TGetSecretAccessVolumeResponse,
  TGetSecretBlindIndexStatusDTO,
  TGetSecretBlindIndexStatusResponse,
  TGetSecretsDuplicationDTO,
  TGetSecretsDuplicationResponse,
  TOrgAuthMethodUsage,
  TOrgProjectsInsights,
  TOrgSecretAccessVolume,
  TOrgSecretsCounts,
  TOrgSecretsSummary,
  TOrgStaticSecretUsage
} from "./types";

export const secretInsightsKeys = {
  all: () => ["secret-insights"] as const,
  calendarEvents: (params: TGetCalendarInsightsDTO) =>
    [...secretInsightsKeys.all(), "calendar-events", params] as const,
  accessVolume: (params: TGetSecretAccessVolumeDTO) =>
    [...secretInsightsKeys.all(), "access-volume", params] as const,
  // accessLocations: (params: TGetSecretAccessLocationsDTO) =>
  //   [...secretInsightsKeys.all(), "access-locations", params] as const,
  authMethodDistribution: (params: TGetAuthMethodDistributionDTO) =>
    [...secretInsightsKeys.all(), "auth-method-distribution", params] as const,
  summary: (params: TGetInsightsSummaryDTO) =>
    [...secretInsightsKeys.all(), "summary", params] as const,
  counts: (params: TGetInsightsCountsDTO) =>
    [...secretInsightsKeys.all(), "counts", params] as const,
  secretsDuplication: (params: TGetSecretsDuplicationDTO) =>
    [...secretInsightsKeys.all(), "secrets-duplication", params] as const,
  blindIndexStatus: (params: TGetSecretBlindIndexStatusDTO) =>
    [...secretInsightsKeys.all(), "blind-index-status", params] as const,
  // Org-scoped keys. The endpoints derive the org from the auth token, so orgId is only
  // here to isolate the cache when the user switches organizations.
  orgSecretsSummary: (orgId: string) =>
    [...secretInsightsKeys.all(), "org-secrets-summary", { orgId }] as const,
  orgSecretsProjects: (orgId: string, params: TGetOrgSecretsProjectsDTO) =>
    [...secretInsightsKeys.all(), "org-secrets-projects", { orgId, ...params }] as const,
  orgAuthMethodDistribution: (orgId: string) =>
    [...secretInsightsKeys.all(), "org-auth-method-distribution", { orgId }] as const,
  orgStaticSecretsUsage: (orgId: string) =>
    [...secretInsightsKeys.all(), "org-static-secrets-usage", { orgId }] as const,
  orgAccessVolume: (orgId: string) =>
    [...secretInsightsKeys.all(), "org-access-volume", { orgId }] as const,
  orgSecretsCounts: (orgId: string) =>
    [...secretInsightsKeys.all(), "org-secrets-counts", { orgId }] as const
};

const INSIGHTS_STALE_TIME = 5 * 60 * 1000; // 5 minutes

export const useGetCalendarInsights = (
  params: TGetCalendarInsightsDTO,
  options?: Omit<
    UseQueryOptions<
      TGetCalendarInsightsResponse,
      unknown,
      TGetCalendarInsightsResponse,
      ReturnType<typeof secretInsightsKeys.calendarEvents>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: secretInsightsKeys.calendarEvents(params),
    queryFn: async () => {
      const { projectId, ...query } = params;
      const { data } = await apiRequest.get<TGetCalendarInsightsResponse>(
        `/api/v1/insights/${projectId}/secrets/calendar`,
        { params: query }
      );
      return data;
    },
    staleTime: INSIGHTS_STALE_TIME,
    ...options
  });
};

export const useGetSecretAccessVolume = (
  params: TGetSecretAccessVolumeDTO,
  options?: Omit<
    UseQueryOptions<
      TGetSecretAccessVolumeResponse,
      unknown,
      TGetSecretAccessVolumeResponse,
      ReturnType<typeof secretInsightsKeys.accessVolume>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: secretInsightsKeys.accessVolume(params),
    queryFn: async () => {
      const { data } = await apiRequest.get<TGetSecretAccessVolumeResponse>(
        `/api/v1/insights/${params.projectId}/secrets/access-volume`
      );
      return data;
    },
    staleTime: INSIGHTS_STALE_TIME,
    ...options
  });
};

export const useGetAuthMethodDistribution = (
  params: TGetAuthMethodDistributionDTO,
  options?: Omit<
    UseQueryOptions<
      TGetAuthMethodDistributionResponse,
      unknown,
      TGetAuthMethodDistributionResponse,
      ReturnType<typeof secretInsightsKeys.authMethodDistribution>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: secretInsightsKeys.authMethodDistribution(params),
    queryFn: async () => {
      const { projectId, ...query } = params;
      const { data } = await apiRequest.get<TGetAuthMethodDistributionResponse>(
        `/api/v1/insights/${projectId}/usage/auth-methods`,
        { params: query }
      );
      return data;
    },
    staleTime: INSIGHTS_STALE_TIME,
    ...options
  });
};

export const useGetInsightsSummary = (
  params: TGetInsightsSummaryDTO,
  options?: Omit<
    UseQueryOptions<
      TGetInsightsSummaryResponse,
      unknown,
      TGetInsightsSummaryResponse,
      ReturnType<typeof secretInsightsKeys.summary>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: secretInsightsKeys.summary(params),
    queryFn: async () => {
      const { projectId, ...query } = params;
      const { data } = await apiRequest.get<TGetInsightsSummaryResponse>(
        `/api/v1/insights/${projectId}/secrets/summary`,
        { params: query }
      );
      return data;
    },
    staleTime: INSIGHTS_STALE_TIME,
    ...options
  });
};

export const useGetInsightsCounts = (
  params: TGetInsightsCountsDTO,
  options?: Omit<
    UseQueryOptions<
      TGetInsightsCountsResponse,
      unknown,
      TGetInsightsCountsResponse,
      ReturnType<typeof secretInsightsKeys.counts>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: secretInsightsKeys.counts(params),
    queryFn: async () => {
      const { data } = await apiRequest.get<TGetInsightsCountsResponse>(
        `/api/v1/insights/${params.projectId}/secrets/counts`
      );
      return data;
    },
    staleTime: INSIGHTS_STALE_TIME,
    ...options
  });
};

export const useGetSecretsDuplication = (
  params: TGetSecretsDuplicationDTO,
  options?: Omit<
    UseQueryOptions<
      TGetSecretsDuplicationResponse,
      unknown,
      TGetSecretsDuplicationResponse,
      ReturnType<typeof secretInsightsKeys.secretsDuplication>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: secretInsightsKeys.secretsDuplication(params),
    queryFn: async () => {
      const res = await apiRequest.get<TGetSecretsDuplicationResponse>(
        `/api/v1/insights/${params.projectId}/secrets/secrets-duplication`
      );
      const remainingTtl = Number(res.headers["x-cache-ttl"] ?? -1);
      return { ...res.data, remainingTtl };
    },
    staleTime: INSIGHTS_STALE_TIME,
    ...options
  });
};

export const useGetSecretBlindIndexStatus = (
  params: TGetSecretBlindIndexStatusDTO,
  options?: Omit<
    UseQueryOptions<
      TGetSecretBlindIndexStatusResponse,
      unknown,
      TGetSecretBlindIndexStatusResponse,
      ReturnType<typeof secretInsightsKeys.blindIndexStatus>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: secretInsightsKeys.blindIndexStatus(params),
    queryFn: async () => {
      const { data } = await apiRequest.get<TGetSecretBlindIndexStatusResponse>(
        `/api/v1/projects/${params.projectId}/secret-blind-index/status`
      );
      return data;
    },
    staleTime: 0,
    ...options
  });
};

// Org-scoped insights hooks. The endpoints have no :projectId — the backend resolves the
// org from the auth token, so the hooks only take orgId to key the cache.

export const useGetOrgSecretsSummary = (orgId: string) => {
  return useQuery({
    queryKey: secretInsightsKeys.orgSecretsSummary(orgId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ usageInsights: TOrgSecretsSummary }>(
        "/api/v1/insights/secrets/summary"
      );
      return data.usageInsights;
    },
    enabled: Boolean(orgId),
    staleTime: INSIGHTS_STALE_TIME
  });
};

export const useGetOrgSecretsProjects = (orgId: string, params: TGetOrgSecretsProjectsDTO = {}) => {
  return useInfiniteQuery({
    queryKey: secretInsightsKeys.orgSecretsProjects(orgId, params),
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const { data } = await apiRequest.get<{ projectWarnings: TOrgProjectsInsights }>(
        "/api/v1/insights/secrets/projects",
        { params: { ...params, offset: pageParam } }
      );
      return data.projectWarnings;
    },
    // Rows are ordered severityScore desc, so the first `projectsWithIssues` rows are
    // exactly the problem projects; there is nothing worth fetching past that boundary.
    getNextPageParam: (lastPage) => {
      if (lastPage.projects.length === 0) return undefined;
      const nextOffset = lastPage.offset + lastPage.projects.length;
      return nextOffset < lastPage.projectsWithIssues ? nextOffset : undefined;
    },
    enabled: Boolean(orgId),
    staleTime: INSIGHTS_STALE_TIME
  });
};

export const useGetOrgAuthMethodDistribution = (orgId: string) => {
  return useQuery({
    queryKey: secretInsightsKeys.orgAuthMethodDistribution(orgId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ authMethodDistribution: TOrgAuthMethodUsage }>(
        "/api/v1/insights/secrets/usage/auth-methods"
      );
      return data.authMethodDistribution;
    },
    enabled: Boolean(orgId),
    staleTime: INSIGHTS_STALE_TIME
  });
};

export const useGetOrgStaticSecretsUsage = (orgId: string) => {
  return useQuery({
    queryKey: secretInsightsKeys.orgStaticSecretsUsage(orgId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ staticSecretUsage: TOrgStaticSecretUsage }>(
        "/api/v1/insights/secrets/usage/static-secrets"
      );
      return data.staticSecretUsage;
    },
    enabled: Boolean(orgId),
    staleTime: INSIGHTS_STALE_TIME
  });
};

export const useGetOrgSecretsAccessVolume = (orgId: string) => {
  return useQuery({
    queryKey: secretInsightsKeys.orgAccessVolume(orgId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ accessVolume: TOrgSecretAccessVolume }>(
        "/api/v1/insights/secrets/access-volume"
      );
      return data.accessVolume;
    },
    enabled: Boolean(orgId),
    staleTime: INSIGHTS_STALE_TIME
  });
};

export const useGetOrgSecretsCounts = (orgId: string) => {
  return useQuery({
    queryKey: secretInsightsKeys.orgSecretsCounts(orgId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ counts: TOrgSecretsCounts }>(
        "/api/v1/insights/secrets/counts"
      );
      return data.counts;
    },
    enabled: Boolean(orgId),
    staleTime: INSIGHTS_STALE_TIME
  });
};
