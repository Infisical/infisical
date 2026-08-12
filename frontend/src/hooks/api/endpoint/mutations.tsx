import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { endpointKeys } from "./queries";
import {
  TCreateEndpointNetworkRuleDTO,
  TDeleteEndpointDeviceDTO,
  TDeleteEndpointNetworkRuleDTO,
  TEndpointDevice,
  TEndpointNetworkRule,
  TRegisterEndpointDeviceDTO,
  TUpdateEndpointNetworkRuleDTO
} from "./types";

export const useRegisterEndpointDevice = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (dto: TRegisterEndpointDeviceDTO) => {
      const { data } = await apiRequest.post<{ device: TEndpointDevice }>(
        "/api/v1/endpoint/devices",
        dto
      );
      return data.device;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: endpointKeys.devices() })
  });
};

export const useDeleteEndpointDevice = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ deviceId }: TDeleteEndpointDeviceDTO) => {
      const { data } = await apiRequest.delete<{ device: TEndpointDevice }>(
        `/api/v1/endpoint/devices/${deviceId}`
      );
      return data.device;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: endpointKeys.devices() })
  });
};

// A rule change bumps every device's config version, so the device list is refreshed too.
const invalidateNetworkPolicy = (queryClient: ReturnType<typeof useQueryClient>) =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: endpointKeys.networkRules() }),
    queryClient.invalidateQueries({ queryKey: endpointKeys.devices() })
  ]);

export const useCreateEndpointNetworkRule = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (dto: TCreateEndpointNetworkRuleDTO) => {
      const { data } = await apiRequest.post<{ networkRule: TEndpointNetworkRule }>(
        "/api/v1/endpoint/network-rules",
        dto
      );
      return data.networkRule;
    },
    onSuccess: () => invalidateNetworkPolicy(queryClient)
  });
};

export const useUpdateEndpointNetworkRule = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ ruleId, ...dto }: TUpdateEndpointNetworkRuleDTO) => {
      const { data } = await apiRequest.patch<{ networkRule: TEndpointNetworkRule }>(
        `/api/v1/endpoint/network-rules/${ruleId}`,
        dto
      );
      return data.networkRule;
    },
    onSuccess: () => invalidateNetworkPolicy(queryClient)
  });
};

export const useDeleteEndpointNetworkRule = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ ruleId }: TDeleteEndpointNetworkRuleDTO) => {
      const { data } = await apiRequest.delete<{ networkRule: TEndpointNetworkRule }>(
        `/api/v1/endpoint/network-rules/${ruleId}`
      );
      return data.networkRule;
    },
    onSuccess: () => invalidateNetworkPolicy(queryClient)
  });
};
