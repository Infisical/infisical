import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { endpointKeys } from "./queries";
import {
  TCreateEndpointEgressRuleDTO,
  TDeleteEndpointDeviceDTO,
  TDeleteEndpointEgressRuleDTO,
  TEndpointDevice,
  TEndpointEgressRule,
  TRegisterEndpointDeviceDTO,
  TUpdateEndpointEgressRuleDTO
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
const invalidateEgressPolicy = (queryClient: ReturnType<typeof useQueryClient>) =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: endpointKeys.egressRules() }),
    queryClient.invalidateQueries({ queryKey: endpointKeys.devices() })
  ]);

export const useCreateEndpointEgressRule = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (dto: TCreateEndpointEgressRuleDTO) => {
      const { data } = await apiRequest.post<{ egressRule: TEndpointEgressRule }>(
        "/api/v1/endpoint/egress-rules",
        dto
      );
      return data.egressRule;
    },
    onSuccess: () => invalidateEgressPolicy(queryClient)
  });
};

export const useUpdateEndpointEgressRule = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ ruleId, ...dto }: TUpdateEndpointEgressRuleDTO) => {
      const { data } = await apiRequest.patch<{ egressRule: TEndpointEgressRule }>(
        `/api/v1/endpoint/egress-rules/${ruleId}`,
        dto
      );
      return data.egressRule;
    },
    onSuccess: () => invalidateEgressPolicy(queryClient)
  });
};

export const useDeleteEndpointEgressRule = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ ruleId }: TDeleteEndpointEgressRuleDTO) => {
      const { data } = await apiRequest.delete<{ egressRule: TEndpointEgressRule }>(
        `/api/v1/endpoint/egress-rules/${ruleId}`
      );
      return data.egressRule;
    },
    onSuccess: () => invalidateEgressPolicy(queryClient)
  });
};
