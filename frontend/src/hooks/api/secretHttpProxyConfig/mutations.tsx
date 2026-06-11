import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { secretHttpProxyConfigKeys } from "./queries";
import {
  TDeleteSecretHttpProxyConfigDTO,
  TSecretHttpProxyConfig,
  TUpsertSecretHttpProxyConfigDTO
} from "./types";

export const useUpsertSecretHttpProxyConfig = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ projectId, secretId, placeholder, rules }: TUpsertSecretHttpProxyConfigDTO) => {
      const { data } = await apiRequest.put<{ proxyConfig: TSecretHttpProxyConfig }>(
        `/api/v1/projects/${projectId}/secrets/${secretId}/http-proxy-config`,
        { placeholder, rules }
      );
      return data.proxyConfig;
    },
    onSuccess: (_, { projectId, secretId }) => {
      queryClient.invalidateQueries({
        queryKey: secretHttpProxyConfigKeys.bySecretId({ projectId, secretId })
      });
    }
  });
};

export const useDeleteSecretHttpProxyConfig = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ projectId, secretId }: TDeleteSecretHttpProxyConfigDTO) => {
      const { data } = await apiRequest.delete<{ proxyConfig: TSecretHttpProxyConfig }>(
        `/api/v1/projects/${projectId}/secrets/${secretId}/http-proxy-config`
      );
      return data.proxyConfig;
    },
    onSuccess: (_, { projectId, secretId }) => {
      queryClient.invalidateQueries({
        queryKey: secretHttpProxyConfigKeys.bySecretId({ projectId, secretId })
      });
    }
  });
};
