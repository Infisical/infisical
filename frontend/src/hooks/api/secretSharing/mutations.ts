import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { secretSharingKeys } from "./queries";
import {
  TCreatedSharedSecret,
  TCreateSharedSecretRequest,
  TDeleteSharedSecretRequest,
  TSharedSecret
} from "./types";

export const useCreateSharedSecret = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (inputData: TCreateSharedSecretRequest) => {
      const { data } = await apiRequest.post<TCreatedSharedSecret>(
        "/api/v1/secret-sharing",
        inputData
      );
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries(secretSharingKeys.allSharedSecrets())
  });
};

export const useCreatePublicSharedSecret = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (inputData: TCreateSharedSecretRequest) => {
      const { data } = await apiRequest.post<TCreatedSharedSecret>(
        "/api/v1/secret-sharing/public",
        inputData
      );
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries(secretSharingKeys.allSharedSecrets())
  });
};

export const useDeleteSharedSecret = () => {
  const queryClient = useQueryClient();
  return useMutation<TSharedSecret, { message: string }, { sharedSecretId: string }>({
    mutationFn: async ({ sharedSecretId }: TDeleteSharedSecretRequest) => {
      const { data } = await apiRequest.delete<TSharedSecret>(
        `/api/v1/secret-sharing/${sharedSecretId}`
      );
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries(secretSharingKeys.allSharedSecrets())
  });
};
