import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { userSecretKeys } from "./queries";
import { TDeleteUserSecretRequest, TUserSecretRequest, TUserSecretResponse } from "./types";

export const useCreateUserSecret = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (inputData: TUserSecretRequest) => {
      const { data } = await apiRequest.post<TUserSecretResponse>(
        "/api/v1/user-secrets",
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
    mutationFn: async ({ id, updateData }: { id: string; updateData: TUserSecretRequest }) => {
      const { data } = await apiRequest.put<TUserSecretResponse>(
        `/api/v1/user-secrets/${id}`,
        updateData
      );
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries(userSecretKeys.allUserSecrets())
  });
};

export const useDeleteUserSecret = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: TDeleteUserSecretRequest) => {
      const { data } = await apiRequest.delete<TUserSecretResponse>(`/api/v1/user-secrets/${id}`);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries(userSecretKeys.allUserSecrets())
  });
};
