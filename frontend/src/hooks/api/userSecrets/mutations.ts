import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { userCredentialsKeys } from "./queries";
import {
  TCreateCredentialRequest,
  TDeleteUserSecretRequest,
  TUserSecrets
} from "./types";

export const useCreateUserCredentials = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (inputData: TCreateCredentialRequest) => {
      const { data } = await apiRequest.put<TUserSecrets>(
       "/api/v1/user-secrets/create",
        inputData
      );
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries(userCredentialsKeys.allCredentials())
  });
};


export const useDeleteSharedSecret = () => {
  const queryClient = useQueryClient();
  return useMutation<TUserSecrets, { message: string }, { sharedSecretId: string }>({
    mutationFn: async ({ secretId }: TDeleteUserSecretRequest) => {
      const { data } = await apiRequest.delete<TUserSecrets>(
        `/api/v1/user-secrets/${secretId}`
      );
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries(userCredentialsKeys.allCredentials())
  });
};
