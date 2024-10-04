import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { userSecretQueryKeys } from "./queries";

export const useDeleteUserSecret = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (secretId: string) => {
      const { data } = await apiRequest.delete(`/api/v1/user-secrets?id=${secretId}`);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries(userSecretQueryKeys.userSecrets())
  });
};

export const useCreateUserSecret = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (formData: any) => {
      const { data } = await apiRequest.post("/api/v1/user-secrets", formData);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries(userSecretQueryKeys.userSecrets())
  });
};
