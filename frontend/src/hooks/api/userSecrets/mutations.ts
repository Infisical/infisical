import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { type NewUserSecretDTO } from "./types";

export const useCreateUserSecret = () => {
  const queryClient = useQueryClient();

  return useMutation<{}, {}, { userId: string; userSecret: NewUserSecretDTO }>({
    mutationFn: async ({ userId, userSecret }) => {
      const { data } = await apiRequest.post("api/v1/user-secrets", {
        userId,
        userSecret
      });

      return data;
    },
    onSuccess: () => queryClient.invalidateQueries(["api/v1/user-secrets"])
  });
};

export const useUpdateUserSecret = () => {
  const queryClient = useQueryClient();

  return useMutation<
    {},
    {},
    { userSecretId: string; userId: string; userSecret: NewUserSecretDTO }
  >({
    mutationFn: async ({ userSecretId, userId, userSecret }) => {
      const { data } = await apiRequest.patch(`api/v1/user-secrets/${userSecretId}`, {
        userId,
        userSecret
      });

      return data;
    },
    onSuccess: () => queryClient.invalidateQueries(["api/v1/user-secrets"])
  });
};

export const useDeleteUserSecret = () => {
  const queryClient = useQueryClient();

  return useMutation<{}, {}, { userSecretId: string }>({
    mutationFn: async ({ userSecretId }) => {
      await apiRequest.delete(`api/v1/user-secrets/${userSecretId}`);

      return {};
    },
    onSuccess: () => queryClient.invalidateQueries(["api/v1/user-secrets"])
  });
};
