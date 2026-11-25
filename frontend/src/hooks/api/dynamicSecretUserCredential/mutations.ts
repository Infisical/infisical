import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { dynamicSecretUserCredentialKeys } from "./queries";
import { TDeleteDynamicSecretUserCredentialDTO, TDynamicSecretUserCredential } from "./types";

export const useDeleteDynamicSecretUserCredential = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      dynamicSecretName,
      externalUserId,
      projectSlug,
      environmentSlug,
      path
    }: TDeleteDynamicSecretUserCredentialDTO) => {
      const { data } = await apiRequest.delete<{
        userCredential: TDynamicSecretUserCredential;
        isRefreshTokenRevoked: boolean;
      }>(
        `/api/v1/dynamic-secrets/${dynamicSecretName}/user-credentials/${encodeURIComponent(externalUserId)}`,
        { params: { projectSlug, environmentSlug, path } }
      );
      return data;
    },
    onSuccess: (_, { dynamicSecretName, projectSlug, environmentSlug, path }) => {
      queryClient.invalidateQueries({
        queryKey: dynamicSecretUserCredentialKeys.all({
          dynamicSecretName,
          projectSlug,
          environmentSlug,
          path
        })
      });
    }
  });
};
