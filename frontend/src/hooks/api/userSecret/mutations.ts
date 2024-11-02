import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@app/config/request";

import { userSecretKeys } from "./queries";
import { TUserSecret, TCreateUserSecretRequest, TUpdateUserSecretRequest } from "./types";

export const useCreateUserSecret = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (inputData: TCreateUserSecretRequest) => {
      const { data } = await apiRequest.post<TUserSecret>(
        "/api/v1/user-secret",
        inputData
      );
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries(userSecretKeys.allUserSecrets())
  });
};

export const useUpdateUserSecret = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ secretId, ...inputData }: TUpdateUserSecretRequest) => {
      const { data } = await apiRequest.patch<TUserSecret>(
        `/api/v1/user-secret/${secretId}`,
        inputData
      );
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries(userSecretKeys.allUserSecrets())
  });
};

export const useDeleteUserSecret = () => {
  const queryClient = useQueryClient();
  return useMutation<TUserSecret, { message: string }, { secretId: string }>({
    mutationFn: async ({ secretId }: { secretId: string }) => {
      const { data } = await apiRequest.delete<TUserSecret>(
        `/api/v1/user-secret/${secretId}`
      );
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries(userSecretKeys.allUserSecrets())
  });
};
