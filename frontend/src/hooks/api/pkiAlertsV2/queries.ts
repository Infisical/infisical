import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import {
  TGetPkiAlertsV2,
  TGetPkiAlertsV2Response,
  TGetPkiAlertV2ById,
  TGetPkiAlertV2CurrentMatchingCertificates,
  TGetPkiAlertV2CurrentMatchingCertificatesResponse,
  TGetPkiAlertV2MatchingCertificates,
  TGetPkiAlertV2MatchingCertificatesResponse,
  TPkiAlertV2
} from "./types";

export const pkiAlertsV2Keys = {
  all: ["pki-alerts-v2"] as const,
  allPkiAlertsV2: (filters?: TGetPkiAlertsV2) => [pkiAlertsV2Keys.all[0], filters] as const,
  specificPkiAlertV2: (alertId: string) => [...pkiAlertsV2Keys.all, alertId] as const,
  pkiAlertV2MatchingCertificates: (alertId: string, filters?: TGetPkiAlertV2MatchingCertificates) =>
    [...pkiAlertsV2Keys.specificPkiAlertV2(alertId), "certificates", filters] as const,
  pkiAlertV2CurrentMatchingCertificates: (filters?: TGetPkiAlertV2CurrentMatchingCertificates) =>
    [...pkiAlertsV2Keys.all, "current-certificates", filters] as const
};

const fetchPkiAlertsV2 = async (params: TGetPkiAlertsV2): Promise<TGetPkiAlertsV2Response> => {
  const { data } = await apiRequest.get<TGetPkiAlertsV2Response>("/api/v1/cert-manager/alerts", {
    params
  });
  return data;
};

const fetchPkiAlertV2ById = async ({ alertId }: TGetPkiAlertV2ById): Promise<TPkiAlertV2> => {
  const { data } = await apiRequest.get<{ alert: TPkiAlertV2 }>(
    `/api/v1/cert-manager/alerts/${alertId}`
  );
  return data.alert;
};

const fetchPkiAlertV2MatchingCertificates = async (
  params: TGetPkiAlertV2MatchingCertificates
): Promise<TGetPkiAlertV2MatchingCertificatesResponse> => {
  const { alertId, ...queryParams } = params;
  const { data } = await apiRequest.get<TGetPkiAlertV2MatchingCertificatesResponse>(
    `/api/v1/cert-manager/alerts/${alertId}/certificates`,
    { params: queryParams }
  );
  return data;
};

const fetchPkiAlertV2CurrentMatchingCertificates = async (
  params: TGetPkiAlertV2CurrentMatchingCertificates
): Promise<TGetPkiAlertV2CurrentMatchingCertificatesResponse> => {
  const { data } = await apiRequest.post<TGetPkiAlertV2CurrentMatchingCertificatesResponse>(
    "/api/v1/cert-manager/alerts/preview/certificates",
    params
  );
  return data;
};

export const useGetPkiAlertsV2 = (
  params: TGetPkiAlertsV2,
  options?: Omit<
    UseQueryOptions<
      TGetPkiAlertsV2Response,
      unknown,
      TGetPkiAlertsV2Response,
      ReturnType<typeof pkiAlertsV2Keys.allPkiAlertsV2>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: pkiAlertsV2Keys.allPkiAlertsV2(params),
    queryFn: () => fetchPkiAlertsV2(params),
    enabled: !!params.projectId,
    ...options
  });
};

export const useGetPkiAlertV2ById = (
  params: TGetPkiAlertV2ById,
  options?: Omit<
    UseQueryOptions<
      TPkiAlertV2,
      unknown,
      TPkiAlertV2,
      ReturnType<typeof pkiAlertsV2Keys.specificPkiAlertV2>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: pkiAlertsV2Keys.specificPkiAlertV2(params.alertId),
    queryFn: () => fetchPkiAlertV2ById(params),
    enabled: !!params.alertId,
    ...options
  });
};

export const useGetPkiAlertV2MatchingCertificates = (
  params: TGetPkiAlertV2MatchingCertificates,
  options?: Omit<
    UseQueryOptions<
      TGetPkiAlertV2MatchingCertificatesResponse,
      unknown,
      TGetPkiAlertV2MatchingCertificatesResponse,
      ReturnType<typeof pkiAlertsV2Keys.pkiAlertV2MatchingCertificates>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: pkiAlertsV2Keys.pkiAlertV2MatchingCertificates(params.alertId, params),
    queryFn: () => fetchPkiAlertV2MatchingCertificates(params),
    enabled: !!params.alertId,
    placeholderData: (previousData) => previousData,
    ...options
  });
};

export const useGetPkiAlertV2CurrentMatchingCertificates = (
  params: TGetPkiAlertV2CurrentMatchingCertificates,
  options?: Omit<
    UseQueryOptions<
      TGetPkiAlertV2CurrentMatchingCertificatesResponse,
      unknown,
      TGetPkiAlertV2CurrentMatchingCertificatesResponse,
      ReturnType<typeof pkiAlertsV2Keys.pkiAlertV2CurrentMatchingCertificates>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: pkiAlertsV2Keys.pkiAlertV2CurrentMatchingCertificates(params),
    queryFn: () => fetchPkiAlertV2CurrentMatchingCertificates(params),
    enabled: !!params.projectId && params.filters !== undefined,
    placeholderData: (previousData) => previousData,
    ...options
  });
};
