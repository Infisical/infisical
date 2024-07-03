import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import {
  TCreateConsumerSecretRequest,
  TDeleteConsumerSecretRequest,
  TEditConsumerSecretRequest} from "./types";

export const useCreateConsumerSecret = () => {
  const queryClient = useQueryClient();
  return useMutation(
    (newSecret: TCreateConsumerSecretRequest) =>
      apiRequest.post("/api/v1/consumer-secrets", newSecret),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(["consumerSecrets"]);
      }
    }
  );
};

export const useEditConsumerSecret = () => {
  const queryClient = useQueryClient();
  return useMutation(
    (updatedSecret: TEditConsumerSecretRequest) =>
      apiRequest.put(`/api/v1/consumer-secrets/${updatedSecret.consumerSecretId}`, updatedSecret),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(["consumerSecrets"]);
      }
    }
  );
};

export const useDeleteConsumerSecret = () => {
  const queryClient = useQueryClient();
  return useMutation(
    (deleteRequest: TDeleteConsumerSecretRequest) =>
      apiRequest.delete(`/api/v1/consumer-secrets/${deleteRequest.consumerSecretId}`),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(["consumerSecrets"]);
      }
    }
  );
};
