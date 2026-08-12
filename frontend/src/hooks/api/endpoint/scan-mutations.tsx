import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { endpointScanKeys } from "./scan-queries";
import {
  TEndpointDeviceScan,
  TEndpointScanPolicy,
  TRequestEndpointScanDTO,
  TUpdateEndpointScanPolicyDTO
} from "./scan-types";

export const useUpdateEndpointScanPolicy = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (dto: TUpdateEndpointScanPolicyDTO) => {
      const { data } = await apiRequest.patch<{ policy: TEndpointScanPolicy }>(
        "/api/v1/endpoint/scan/policy",
        dto
      );
      return data.policy;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: endpointScanKeys.all })
  });
};

export const useRequestEndpointScan = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ deviceId }: TRequestEndpointScanDTO) => {
      const { data } = await apiRequest.post<{ deviceScan: TEndpointDeviceScan }>(
        `/api/v1/endpoint/scan/devices/${deviceId}/request`
      );
      return data.deviceScan;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: endpointScanKeys.all })
  });
};
