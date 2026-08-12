import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { endpointKeys } from "./queries";
import {
  TEndpointDeviceScan,
  TEndpointScanPolicy,
  TEndpointSecretFinding,
  TListEndpointSecretFindingsDTO
} from "./scan-types";

// Nested under the endpoint prefix so invalidating endpointKeys.all also clears scanning.
export const endpointScanKeys = {
  all: [...endpointKeys.all, "scan"] as const,
  policy: () => [...endpointScanKeys.all, "policy"] as const,
  findings: (params?: TListEndpointSecretFindingsDTO) =>
    [...endpointScanKeys.all, "findings", params] as const,
  deviceScans: () => [...endpointScanKeys.all, "device-scans"] as const
};

export const useEndpointScanPolicy = (
  options?: Omit<UseQueryOptions<TEndpointScanPolicy>, "queryKey" | "queryFn">
) =>
  useQuery({
    queryKey: endpointScanKeys.policy(),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ policy: TEndpointScanPolicy }>(
        "/api/v1/endpoint/scan/policy"
      );
      return data.policy;
    },
    ...options
  });

// A requested scan lands seconds later, and the point of the page is watching it arrive, so these two
// override the 60s global staleTime rather than making the admin refresh.
export const useListEndpointSecretFindings = (
  params: TListEndpointSecretFindingsDTO = {},
  options?: Omit<UseQueryOptions<TEndpointSecretFinding[]>, "queryKey" | "queryFn">
) =>
  useQuery({
    queryKey: endpointScanKeys.findings(params),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ findings: TEndpointSecretFinding[] }>(
        "/api/v1/endpoint/scan/findings",
        { params }
      );
      return data.findings;
    },
    refetchInterval: 3000,
    staleTime: 0,
    ...options
  });

export const useListEndpointDeviceScans = (
  options?: Omit<UseQueryOptions<TEndpointDeviceScan[]>, "queryKey" | "queryFn">
) =>
  useQuery({
    queryKey: endpointScanKeys.deviceScans(),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ deviceScans: TEndpointDeviceScan[] }>(
        "/api/v1/endpoint/scan/device-scans"
      );
      return data.deviceScans;
    },
    refetchInterval: 3000,
    staleTime: 0,
    ...options
  });
