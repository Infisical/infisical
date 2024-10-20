import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { userCredentialsKeys } from "./queries";
import {
  TCreateCredentialRequest,
  TUserSecrets
} from "./types"; // TUserSecrets replaces TCreatedSharedSecret as per schema

export const useCreateUserCredentials = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (inputData: TCreateCredentialRequest) => {
      console.log("inputData==",inputData)
      const { data } = await apiRequest.post<TUserSecrets>(
        "/api/v1/user-secrets/create",
        inputData
      );
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries(userCredentialsKeys.allCredentials())
  });
};
