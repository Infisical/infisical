import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { dashboardKeys } from "@app/hooks/api/dashboard/queries";

import { dynamicSecretKeys } from "./queries";
import {
  TCreateDynamicSecretDTO,
  TDeleteDynamicSecretDTO,
  TDynamicSecret,
  TUpdateDynamicSecretDTO
} from "./types";

export const useCreateDynamicSecret = () => {
  const queryClient = useQueryClient();

  return useMutation<object, object, TCreateDynamicSecretDTO>({
    mutationFn: async (dto) => {
      const { data } = await apiRequest.post<{ dynamicSecret: TDynamicSecret }>(
        "/api/v1/dynamic-secrets",
        dto
      );
      return data.dynamicSecret;
    },
    onSuccess: (_, { path, environmentSlug, projectSlug }) => {
      // TODO: optimize but we currently don't pass projectId
      queryClient.invalidateQueries({ queryKey: dashboardKeys.all() });
      queryClient.invalidateQueries({
        queryKey: dynamicSecretKeys.list({ path, projectSlug, environmentSlug })
      });
    }
  });
};

export const useUpdateDynamicSecret = () => {
  const queryClient = useQueryClient();

  return useMutation<object, object, TUpdateDynamicSecretDTO>({
    mutationFn: async (dto) => {
      const { data } = await apiRequest.patch<{ dynamicSecret: TDynamicSecret }>(
        `/api/v1/dynamic-secrets/${dto.name}`,
        dto
      );
      return data.dynamicSecret;
    },
    onSuccess: (_, { path, environmentSlug, projectSlug }) => {
      // TODO: optimize but currently don't pass projectId
      queryClient.invalidateQueries({ queryKey: dashboardKeys.all() });
      queryClient.invalidateQueries({
        queryKey: dynamicSecretKeys.list({ path, projectSlug, environmentSlug })
      });
    }
  });
};

export const useDeleteDynamicSecret = () => {
  const queryClient = useQueryClient();

  return useMutation<object, object, TDeleteDynamicSecretDTO>({
    mutationFn: async (dto) => {
      const { data } = await apiRequest.delete<{ dynamicSecret: TDynamicSecret }>(
        `/api/v1/dynamic-secrets/${dto.name}`,
        { data: dto }
      );
      return data.dynamicSecret;
    },
    onSuccess: (_, { path, environmentSlug, projectSlug }) => {
      // TODO: optimize but currently don't pass projectId
      queryClient.invalidateQueries({ queryKey: dashboardKeys.all() });
      queryClient.invalidateQueries({
        queryKey: dynamicSecretKeys.list({ path, projectSlug, environmentSlug })
      });
    }
  });
};
