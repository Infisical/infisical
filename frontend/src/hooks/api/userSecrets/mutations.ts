import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import {
  TCreatedUserSecret,
  TCreateUserSecretRequest,
  TDeleteUserSecretRequest,
  TUpdateUserSecretRequest,
  TUserSecret
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

export const useUpdateUserSecret = () => {
  const queryClient = useQueryClient();

  return useMutation<{}, {}, TUpdateUserSecretRequest>({
    mutationFn: async (inputData: TUpdateUserSecretRequest) => {
      const { data } = await apiRequest.patch(`/api/v1/user-secrets/${inputData.userSecretId}`, inputData);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(userSecretsKeys.allUserSecrets());
    }
  });
};

export const useDeleteUserSecret = () => {
  const queryClient = useQueryClient();
  return useMutation<TUserSecret, { message: string }, { userSecretId: string }>({
    mutationFn: async ({ userSecretId }: TDeleteUserSecretRequest) => {
      const { data } = await apiRequest.delete<TUserSecret>(
        `/api/v1/user-secrets/${userSecretId}`
      );
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries(userSecretsKeys.allUserSecrets())
  });
};
