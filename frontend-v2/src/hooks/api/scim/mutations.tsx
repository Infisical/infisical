import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { scimKeys } from "./queries";
import { CreateScimTokenDTO, CreateScimTokenRes, DeleteScimTokenDTO } from "./types";

export const useCreateScimToken = () => {
  const queryClient = useQueryClient();
  return useMutation<CreateScimTokenRes, object, CreateScimTokenDTO>({
    mutationFn: async ({ organizationId, description, ttlDays }) => {
      const { data } = await apiRequest.post("/api/v1/scim/scim-tokens", {
        organizationId,
        description,
        ttlDays
      });

      return data;
    },
    onSuccess: (_, { organizationId }) => {
      queryClient.invalidateQueries({ queryKey: scimKeys.getScimTokens(organizationId) });
    }
  });
};

export const useDeleteScimToken = () => {
  const queryClient = useQueryClient();
  return useMutation<CreateScimTokenRes, object, DeleteScimTokenDTO>({
    mutationFn: async ({ scimTokenId }) => {
      const { data } = await apiRequest.delete(`/api/v1/scim/scim-tokens/${scimTokenId}`);
      return data;
    },
    onSuccess: (_, { organizationId }) => {
      queryClient.invalidateQueries({ queryKey: scimKeys.getScimTokens(organizationId) });
    }
  });
};
