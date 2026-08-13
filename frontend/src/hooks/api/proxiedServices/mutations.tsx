import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { agentGatewayKeys } from "@app/hooks/api/agentGateways/queries";

import { proxiedServiceKeys } from "./queries";
import {
  TCreateProxiedServiceDTO,
  TDeleteProxiedServiceDTO,
  TProxiedService,
  TUpdateProxiedServiceDTO
} from "./types";

// Agent gateway queries embed their linked services, so a service edit has to invalidate those too or a
// detail page keeps showing a stale host pattern for a service it brokers.
const invalidate = (queryClient: ReturnType<typeof useQueryClient>) => {
  queryClient.invalidateQueries({ queryKey: proxiedServiceKeys.all });
  queryClient.invalidateQueries({ queryKey: agentGatewayKeys.all });
};

export const useCreateProxiedService = () => {
  const queryClient = useQueryClient();

  return useMutation<TProxiedService, object, TCreateProxiedServiceDTO>({
    mutationFn: async (dto) => {
      const { data } = await apiRequest.post<{ service: TProxiedService }>(
        "/api/v1/proxied-services",
        dto
      );
      return data.service;
    },
    onSuccess: () => invalidate(queryClient)
  });
};

export const useUpdateProxiedService = () => {
  const queryClient = useQueryClient();

  return useMutation<TProxiedService, object, TUpdateProxiedServiceDTO>({
    mutationFn: async ({ serviceId, ...body }) => {
      const { data } = await apiRequest.patch<{ service: TProxiedService }>(
        `/api/v1/proxied-services/${serviceId}`,
        body
      );
      return data.service;
    },
    onSuccess: () => invalidate(queryClient)
  });
};

export const useDeleteProxiedService = () => {
  const queryClient = useQueryClient();

  return useMutation<void, object, TDeleteProxiedServiceDTO>({
    mutationFn: async ({ serviceId }) => {
      await apiRequest.delete(`/api/v1/proxied-services/${serviceId}`);
    },
    onSuccess: () => invalidate(queryClient)
  });
};
