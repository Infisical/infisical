import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { dynamicSecretKeys } from "./queries";
import {
  TCreateDynamicSecretDTO,
  TDeleteDynamicSecretDTO,
  TDynamicSecret,
  TUpdateDynamicSecretDTO
} from "./types";

export const useCreateDynamicSecret = () => {
  const queryClient = useQueryClient();

  return useMutation<{}, {}, TCreateDynamicSecretDTO>({
    mutationFn: async (dto) => {
      const { data } = await apiRequest.post<{ dynamicSecret: TDynamicSecret }>(
        "/api/v1/dynamic-secrets",
        dto
      );
      return data.dynamicSecret;
    },
    onSuccess: (_, { path, environment, projectSlug }) => {
      queryClient.invalidateQueries(dynamicSecretKeys.list({ path, projectSlug, environment }));
    }
  });
};

export const useUpdateDynamicSecret = () => {
  const queryClient = useQueryClient();

  return useMutation<{}, {}, TUpdateDynamicSecretDTO>({
    mutationFn: async (dto) => {
      const { data } = await apiRequest.patch<{ dynamicSecret: TDynamicSecret }>(
        `/api/v1/dynamic-secrets/${dto.slug}`,
        dto
      );
      return data.dynamicSecret;
    },
    onSuccess: (_, { path, environment, projectSlug }) => {
      queryClient.invalidateQueries(dynamicSecretKeys.list({ path, projectSlug, environment }));
    }
  });
};

export const useDeleteDynamicSecret = () => {
  const queryClient = useQueryClient();

  return useMutation<{}, {}, TDeleteDynamicSecretDTO>({
    mutationFn: async (dto) => {
      const { data } = await apiRequest.delete<{ dynamicSecret: TDynamicSecret }>(
        `/api/v1/dynamic-secrets/${dto.slug}`,
        { data: dto }
      );
      return data.dynamicSecret;
    },
    onSuccess: (_, { path, environment, projectSlug }) => {
      queryClient.invalidateQueries(dynamicSecretKeys.list({ path, projectSlug, environment }));
    }
  });
};
