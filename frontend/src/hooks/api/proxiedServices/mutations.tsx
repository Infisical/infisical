import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { dashboardKeys } from "@app/hooks/api/dashboard/queries";

import { proxiedServiceKeys } from "./queries";
import {
  TCreateProxiedServiceDTO,
  TDeleteProxiedServiceDTO,
  TProxiedService,
  TUpdateProxiedServiceDTO
} from "./types";

const invalidate = (queryClient: ReturnType<typeof useQueryClient>) => {
  queryClient.invalidateQueries({ queryKey: proxiedServiceKeys.all });
  queryClient.invalidateQueries({ queryKey: dashboardKeys.all() });
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
    // projectId is only used for cache scoping, not sent in the request body
    mutationFn: async ({ serviceId, projectId: _projectId, ...body }) => {
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

  return useMutation<TProxiedService, object, TDeleteProxiedServiceDTO>({
    mutationFn: async ({ serviceId }) => {
      const { data } = await apiRequest.delete<{ service: TProxiedService }>(
        `/api/v1/proxied-services/${serviceId}`
      );
      return data.service;
    },
    onSuccess: () => invalidate(queryClient)
  });
};
