import { MutationOptions, useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { dashboardKeys } from "@app/hooks/api/dashboard/queries";

import { secretApprovalRequestKeys } from "../secretApprovalRequest/queries";
import { secretSnapshotKeys } from "../secretSnapshots/queries";
import { userSecretKeys } from "./queries";
import { TCreateUserSecretsV3DTO } from "./types";

export const useCreateUserSecretV3 = ({
  options
}: {
  options?: Omit<MutationOptions<{}, {}, TCreateUserSecretsV3DTO>, "mutationFn">;
} = {}) => {
  const queryClient = useQueryClient();
  return useMutation<{}, {}, TCreateUserSecretsV3DTO>({
    mutationFn: async ({
      secretPath = "/",
      type,
      environment,
      workspaceId,
      secretKey,
      secretValue,
      secretComment
    }) => {
      const { data } = await apiRequest.post(`/api/v3/user-secrets/raw/${secretKey}`, {
        secretPath,
        type,
        environment,
        workspaceId,
        secretValue,
        secretComment
      });
      return data;
    },
    onSuccess: (_, { workspaceId, environment, secretPath }) => {
      queryClient.invalidateQueries(
        dashboardKeys.getDashboardSecrets({ projectId: workspaceId, secretPath })
      );
      queryClient.invalidateQueries(userSecretKeys.getUserSecret({ workspaceId, environment }));
      queryClient.invalidateQueries(
        secretSnapshotKeys.list({ environment, workspaceId, directory: secretPath })
      );
      queryClient.invalidateQueries(
        secretSnapshotKeys.count({ environment, workspaceId, directory: secretPath })
      );
      queryClient.invalidateQueries(secretApprovalRequestKeys.count({ workspaceId }));
    },
    ...options
  });
};

export const createUserSecret = async (dto: TCreateUserSecretsV3DTO) => {
  const { data } = await apiRequest.post(`/api/v3/user-secrets/${dto.secretKey}`, dto);
  return data;
};
