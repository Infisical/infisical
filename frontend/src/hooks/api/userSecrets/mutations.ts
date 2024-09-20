import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { userSecretKeys } from "./queries";
import { TCreateUserSecretRequest, TDeleteUserSecretRequest, TUserSecret } from "./types";

export const useCreateUserSecret = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (inputData: TCreateUserSecretRequest) => {
      const { data } = await apiRequest.post<TUserSecret>("/api/v1/user-secrets", inputData);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries(userSecretKeys.allUserSecrets())
  });
};

export const useDeleteUserSecret = () => {
  const queryClient = useQueryClient();
  return useMutation<TUserSecret, { message: string }, { userSecretId: string }>({
    mutationFn: async ({ userSecretId }: TDeleteUserSecretRequest) => {
      const { data } = await apiRequest.delete<TUserSecret>(`/api/v1/user-secrets/${userSecretId}`);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries(userSecretKeys.allUserSecrets())
  });
};
