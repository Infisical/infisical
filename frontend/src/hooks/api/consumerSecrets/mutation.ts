import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { consumerSecretKeys } from "./query";
import { 
  TCreateConsumerSecretDTO, 
  TDeleteConsumerSecretDTO, 
  TUpdateConsumerSecretDTO} from "./types";

const refreshConsumerSecretsCache = (cacheClient: ReturnType<typeof useQueryClient>) => {
  cacheClient.invalidateQueries(consumerSecretKeys.allConsumerSecrets);
};

const modifyConsumerSecret = async <TData, TVariables>(
  action: "post" | "patch" | "delete",
  endpoint: string,
  payload?: TVariables
) => {
  const { data } = await apiRequest[action]<TData>(endpoint, payload);
  return data;
};

export const useAddConsumerSecret = () => {
  const cacheClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: TCreateConsumerSecretDTO) => 
      modifyConsumerSecret("post", "api/v1/consumer-secrets", payload),
    onSuccess: () => refreshConsumerSecretsCache(cacheClient),
  });
};

export const useEditConsumerSecret = () => {
  const cacheClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: TUpdateConsumerSecretDTO) => 
      modifyConsumerSecret("patch", `/api/v1/consumer-secrets/${payload.id}`, payload),
    onSuccess: () => refreshConsumerSecretsCache(cacheClient),
  });
};

export const useRemoveConsumerSecret = () => {
  const cacheClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: TDeleteConsumerSecretDTO) => 
      modifyConsumerSecret("delete", `/api/v1/consumer-secrets/${payload.id}`),
    onSuccess: () => refreshConsumerSecretsCache(cacheClient),
  });
};
