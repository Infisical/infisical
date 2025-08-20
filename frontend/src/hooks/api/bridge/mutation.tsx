import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { bridgeQueryKeys } from "./queries";
import { TCreateBridgeDTO, TDeleteBridgeDTO, TUpdateBridgeDTO } from "./types";

export const useCreateBridge = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, baseUrl, openApiUrl, slug, ruleSet, headers }: TCreateBridgeDTO) => {
      return apiRequest.post("/api/v1/bridge", {
        projectId,
        baseUrl,
        openApiUrl,
        slug,
        ruleSet,
        headers
      });
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: bridgeQueryKeys.listKey(projectId) });
    }
  });
};

export const useUpdateBridge = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...updateData }: TUpdateBridgeDTO) => {
      return apiRequest.patch(`/api/v1/bridge/${id}`, updateData);
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: bridgeQueryKeys.byIdKey(id) });
      queryClient.invalidateQueries({ queryKey: bridgeQueryKeys.allKey() });
    }
  });
};

export const useDeleteBridge = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: TDeleteBridgeDTO) => {
      return apiRequest.delete(`/api/v1/bridge/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bridgeQueryKeys.allKey() });
    }
  });
};

