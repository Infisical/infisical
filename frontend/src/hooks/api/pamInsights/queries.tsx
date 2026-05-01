import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import {
  TGetPamInsightsParams,
  TGetPamRotationCalendarParams,
  TPamInsightsSummary,
  TPamResourceBreakdownResponse,
  TPamRotationCalendarResponse,
  TPamSessionActivityResponse,
  TPamTopActorsResponse
} from "./types";

export const pamInsightsKeys = {
  all: () => ["pam-insights"] as const,
  summary: (params: TGetPamInsightsParams) =>
    [...pamInsightsKeys.all(), "summary", params] as const,
  sessionActivity: (params: TGetPamInsightsParams) =>
    [...pamInsightsKeys.all(), "session-activity", params] as const,
  topActors: (params: TGetPamInsightsParams) =>
    [...pamInsightsKeys.all(), "top-actors", params] as const,
  resourceBreakdown: (params: TGetPamInsightsParams) =>
    [...pamInsightsKeys.all(), "resource-breakdown", params] as const,
  rotationCalendar: (params: TGetPamRotationCalendarParams) =>
    [...pamInsightsKeys.all(), "rotation-calendar", params] as const
};

const PAM_INSIGHTS_STALE_TIME = 5 * 60 * 1000;
const PAM_INSIGHTS_SUMMARY_REFETCH_INTERVAL = 15 * 1000;

export const useGetPamInsightsSummary = (
  params: TGetPamInsightsParams,
  options?: Omit<
    UseQueryOptions<
      TPamInsightsSummary,
      unknown,
      TPamInsightsSummary,
      ReturnType<typeof pamInsightsKeys.summary>
    >,
    "queryKey" | "queryFn"
  >
) =>
  useQuery({
    queryKey: pamInsightsKeys.summary(params),
    queryFn: async () => {
      const { data } = await apiRequest.get<TPamInsightsSummary>("/api/v1/insights/pam/summary", {
        params
      });
      return data;
    },
    staleTime: 0,
    refetchInterval: PAM_INSIGHTS_SUMMARY_REFETCH_INTERVAL,
    ...options
  });

export const useGetPamSessionActivity = (
  params: TGetPamInsightsParams,
  options?: Omit<
    UseQueryOptions<
      TPamSessionActivityResponse,
      unknown,
      TPamSessionActivityResponse,
      ReturnType<typeof pamInsightsKeys.sessionActivity>
    >,
    "queryKey" | "queryFn"
  >
) =>
  useQuery({
    queryKey: pamInsightsKeys.sessionActivity(params),
    queryFn: async () => {
      const { data } = await apiRequest.get<TPamSessionActivityResponse>(
        "/api/v1/insights/pam/session-activity",
        { params }
      );
      return data;
    },
    staleTime: PAM_INSIGHTS_STALE_TIME,
    ...options
  });

export const useGetPamTopActors = (
  params: TGetPamInsightsParams,
  options?: Omit<
    UseQueryOptions<
      TPamTopActorsResponse,
      unknown,
      TPamTopActorsResponse,
      ReturnType<typeof pamInsightsKeys.topActors>
    >,
    "queryKey" | "queryFn"
  >
) =>
  useQuery({
    queryKey: pamInsightsKeys.topActors(params),
    queryFn: async () => {
      const { data } = await apiRequest.get<TPamTopActorsResponse>(
        "/api/v1/insights/pam/top-actors",
        {
          params
        }
      );
      return data;
    },
    staleTime: PAM_INSIGHTS_STALE_TIME,
    ...options
  });

export const useGetPamResourceBreakdown = (
  params: TGetPamInsightsParams,
  options?: Omit<
    UseQueryOptions<
      TPamResourceBreakdownResponse,
      unknown,
      TPamResourceBreakdownResponse,
      ReturnType<typeof pamInsightsKeys.resourceBreakdown>
    >,
    "queryKey" | "queryFn"
  >
) =>
  useQuery({
    queryKey: pamInsightsKeys.resourceBreakdown(params),
    queryFn: async () => {
      const { data } = await apiRequest.get<TPamResourceBreakdownResponse>(
        "/api/v1/insights/pam/resource-breakdown",
        { params }
      );
      return data;
    },
    staleTime: PAM_INSIGHTS_STALE_TIME,
    ...options
  });

export const useGetPamRotationCalendar = (
  params: TGetPamRotationCalendarParams,
  options?: Omit<
    UseQueryOptions<
      TPamRotationCalendarResponse,
      unknown,
      TPamRotationCalendarResponse,
      ReturnType<typeof pamInsightsKeys.rotationCalendar>
    >,
    "queryKey" | "queryFn"
  >
) =>
  useQuery({
    queryKey: pamInsightsKeys.rotationCalendar(params),
    queryFn: async () => {
      const { data } = await apiRequest.get<TPamRotationCalendarResponse>(
        "/api/v1/insights/pam/rotation-calendar",
        { params }
      );
      return data;
    },
    staleTime: PAM_INSIGHTS_STALE_TIME,
    ...options
  });
