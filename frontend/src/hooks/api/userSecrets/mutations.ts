import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import {
  TCreatedUserSecret,
  TCreateUserSecretRequest
} from "./types";
import { userSecretsKeys } from "./queries";

export const useCreateUserSecret = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (inputData: TCreateUserSecretRequest) => {
      const { data } = await apiRequest.post<TCreatedUserSecret>(
        "/api/v1/user-secrets",
        inputData
      );
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries(userSecretsKeys.allUserSecrets())
  });
};
