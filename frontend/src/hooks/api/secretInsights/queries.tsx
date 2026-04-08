import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import {
  TGetAuthMethodDistributionDTO,
  TGetAuthMethodDistributionResponse,
  TGetCalendarInsightsDTO,
  TGetCalendarInsightsResponse,
  TGetInsightsSummaryDTO,
  TGetInsightsSummaryResponse,
  TGetSecretAccessLocationsDTO,
  TGetSecretAccessLocationsResponse,
  TGetSecretAccessVolumeDTO,
  TGetSecretAccessVolumeResponse
} from "./types";

export const secretInsightsKeys = {
  all: () => ["secret-insights"] as const,
  calendarEvents: (params: TGetCalendarInsightsDTO) =>
    [...secretInsightsKeys.all(), "calendar-events", params] as const,
  accessVolume: (params: TGetSecretAccessVolumeDTO) =>
    [...secretInsightsKeys.all(), "access-volume", params] as const,
  accessLocations: (params: TGetSecretAccessLocationsDTO) =>
    [...secretInsightsKeys.all(), "access-locations", params] as const,
  authMethodDistribution: (params: TGetAuthMethodDistributionDTO) =>
    [...secretInsightsKeys.all(), "auth-method-distribution", params] as const,
  summary: (params: TGetInsightsSummaryDTO) =>
    [...secretInsightsKeys.all(), "summary", params] as const
};

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
    ...options
  });
};

export const useGetSecretAccessLocations = (
  params: TGetSecretAccessLocationsDTO,
  options?: Omit<
    UseQueryOptions<
      TGetSecretAccessLocationsResponse,
      unknown,
      TGetSecretAccessLocationsResponse,
      ReturnType<typeof secretInsightsKeys.accessLocations>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: secretInsightsKeys.accessLocations(params),
    queryFn: async () => {
      const { data } = await apiRequest.get<TGetSecretAccessLocationsResponse>(
        "/api/v1/insights/secrets/access-locations",
        { params }
      );
      return data;
    },
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
      const { data } = await apiRequest.get<TGetAuthMethodDistributionResponse>(
        "/api/v1/insights/auth/method-distribution",
        { params }
      );
      return data;
    },
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
    ...options
  });
};
