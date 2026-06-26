import { useQuery, UseQueryOptions } from "@tanstack/react-query";

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
  // TGetSecretAccessLocationsDTO,
  // TGetSecretAccessLocationsResponse,
  TGetSecretAccessVolumeDTO,
  TGetSecretAccessVolumeResponse,
  TGetSecretBlindIndexStatusDTO,
  TGetSecretBlindIndexStatusResponse,
  TGetSecretsDuplicationDTO,
  TGetSecretsDuplicationResponse
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
    [...secretInsightsKeys.all(), "blind-index-status", params] as const
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
      const { data } = await apiRequest.get<TGetCalendarInsightsResponse>(
        "/api/v1/insights/secrets/calendar",
        { params }
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
        "/api/v1/insights/secrets/access-volume",
        { params }
      );
      return data;
    },
    staleTime: INSIGHTS_STALE_TIME,
    ...options
  });
};

// export const useGetSecretAccessLocations = (
//   params: TGetSecretAccessLocationsDTO,
//   options?: Omit<
//     UseQueryOptions<
//       TGetSecretAccessLocationsResponse,
//       unknown,
//       TGetSecretAccessLocationsResponse,
//       ReturnType<typeof secretInsightsKeys.accessLocations>
//     >,
//     "queryKey" | "queryFn"
//   >
// ) => {
//   return useQuery({
//     queryKey: secretInsightsKeys.accessLocations(params),
//     queryFn: async () => {
//       const { data } = await apiRequest.get<TGetSecretAccessLocationsResponse>(
//         "/api/v1/insights/secrets/access-locations",
//         { params }
//       );
//       return data;
//     },
//     staleTime: INSIGHTS_STALE_TIME,
//     ...options
//   });
// };

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
      const { data } = await apiRequest.get<TGetAuthMethodDistributionResponse>(
        "/api/v1/insights/auth/method-distribution",
        { params }
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
      const { data } = await apiRequest.get<TGetInsightsSummaryResponse>(
        "/api/v1/insights/secrets/summary",
        { params }
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
        "/api/v1/insights/secrets/counts",
        { params }
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
        "/api/v1/insights/secrets/secrets-duplication",
        { params }
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
