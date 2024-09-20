import { MutationOptions, useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { dashboardKeys } from "@app/hooks/api/dashboard/queries";

import { secretApprovalRequestKeys } from "../secretApprovalRequest/queries";
import { secretSnapshotKeys } from "../secretSnapshots/queries";
import { secretKeys } from "./queries";
import {
  TCreateSecretBatchDTO,
  TCreateSecretsV3DTO,
  TDeleteSecretBatchDTO,
  TDeleteSecretsV3DTO,
  TMoveSecretsDTO,
  TUpdateSecretBatchDTO,
  TUpdateSecretsV3DTO
} from "./types";

export const useCreateSecretV3 = ({
  options
}: {
  options?: Omit<MutationOptions<{}, {}, TCreateSecretsV3DTO>, "mutationFn">;
} = {}) => {
  const queryClient = useQueryClient();
  return useMutation<{}, {}, TCreateSecretsV3DTO>({
    mutationFn: async ({
      secretPath = "/",
      type,
      environment,
      workspaceId,
      secretKey,
      secretValue,
      secretComment,
      skipMultilineEncoding
    }) => {
      const { data } = await apiRequest.post(`/api/v3/secrets/raw/${secretKey}`, {
        secretPath,
        type,
        environment,
        workspaceId,
        secretValue,
        secretComment,
        skipMultilineEncoding
      });
      return data;
    },
    onSuccess: (_, { workspaceId, environment, secretPath }) => {
      queryClient.invalidateQueries(
        dashboardKeys.getDashboardSecrets({ projectId: workspaceId, secretPath })
      );
      queryClient.invalidateQueries(
        secretKeys.getProjectSecret({ workspaceId, environment, secretPath })
      );
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

export const useUpdateSecretV3 = ({
  options
}: {
  options?: Omit<MutationOptions<{}, {}, TUpdateSecretsV3DTO>, "mutationFn">;
} = {}) => {
  const queryClient = useQueryClient();
  return useMutation<{}, {}, TUpdateSecretsV3DTO>({
    mutationFn: async ({
      secretPath = "/",
      type,
      environment,
      workspaceId,
      secretKey,
      secretValue,
      tagIds,
      secretComment,
      secretReminderRepeatDays,
      secretReminderNote,
      newSecretName,
      skipMultilineEncoding
    }) => {
      const { data } = await apiRequest.patch(`/api/v3/secrets/raw/${secretKey}`, {
        workspaceId,
        environment,
        type,
        secretReminderNote,
        secretReminderRepeatDays,
        secretPath,
        skipMultilineEncoding,
        newSecretName,
        secretComment,
        tagIds,
        secretValue
      });
      return data;
    },
    onSuccess: (_, { workspaceId, environment, secretPath }) => {
      queryClient.invalidateQueries(
        dashboardKeys.getDashboardSecrets({ projectId: workspaceId, secretPath })
      );
      queryClient.invalidateQueries(
        secretKeys.getProjectSecret({ workspaceId, environment, secretPath })
      );
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

export const useDeleteSecretV3 = ({
  options
}: {
  options?: Omit<MutationOptions<{}, {}, TDeleteSecretsV3DTO>, "mutationFn">;
} = {}) => {
  const queryClient = useQueryClient();

  return useMutation<{}, {}, TDeleteSecretsV3DTO>({
    mutationFn: async ({
      secretPath = "/",
      type,
      environment,
      workspaceId,
      secretKey,
      secretId
    }) => {
      const { data } = await apiRequest.delete(`/api/v3/secrets/raw/${secretKey}`, {
        data: {
          workspaceId,
          environment,
          type,
          secretPath,
          secretId
        }
      });
      return data;
    },
    onSuccess: (_, { workspaceId, environment, secretPath }) => {
      queryClient.invalidateQueries(
        dashboardKeys.getDashboardSecrets({ projectId: workspaceId, secretPath })
      );
      queryClient.invalidateQueries(
        secretKeys.getProjectSecret({ workspaceId, environment, secretPath })
      );
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

export const useCreateSecretBatch = ({
  options
}: {
  options?: Omit<MutationOptions<{}, {}, TCreateSecretBatchDTO>, "mutationFn">;
} = {}) => {
  const queryClient = useQueryClient();

  return useMutation<{}, {}, TCreateSecretBatchDTO>({
    mutationFn: async ({ secretPath = "/", workspaceId, environment, secrets }) => {
      const { data } = await apiRequest.post("/api/v3/secrets/batch/raw", {
        workspaceId,
        environment,
        secretPath,
        secrets
      });
      return data;
    },
    onSuccess: (_, { workspaceId, environment, secretPath }) => {
      queryClient.invalidateQueries(
        dashboardKeys.getDashboardSecrets({ projectId: workspaceId, secretPath })
      );
      queryClient.invalidateQueries(
        secretKeys.getProjectSecret({ workspaceId, environment, secretPath })
      );
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

export const useUpdateSecretBatch = ({
  options
}: {
  options?: Omit<MutationOptions<{}, {}, TUpdateSecretBatchDTO>, "mutationFn">;
} = {}) => {
  const queryClient = useQueryClient();

  return useMutation<{}, {}, TUpdateSecretBatchDTO>({
    mutationFn: async ({ secretPath = "/", workspaceId, environment, secrets }) => {
      const { data } = await apiRequest.patch("/api/v3/secrets/batch/raw", {
        workspaceId,
        environment,
        secretPath,
        secrets
      });
      return data;
    },
    onSuccess: (_, { workspaceId, environment, secretPath }) => {
      queryClient.invalidateQueries(
        dashboardKeys.getDashboardSecrets({ projectId: workspaceId, secretPath })
      );
      queryClient.invalidateQueries(
        secretKeys.getProjectSecret({ workspaceId, environment, secretPath })
      );
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

export const useDeleteSecretBatch = ({
  options
}: {
  options?: Omit<MutationOptions<{}, {}, TDeleteSecretBatchDTO>, "mutationFn">;
} = {}) => {
  const queryClient = useQueryClient();

  return useMutation<{}, {}, TDeleteSecretBatchDTO>({
    mutationFn: async ({ secretPath = "/", workspaceId, environment, secrets }) => {
      const { data } = await apiRequest.delete("/api/v3/secrets/batch/raw", {
        data: {
          workspaceId,
          environment,
          secretPath,
          secrets
        }
      });
      return data;
    },
    onSuccess: (_, { workspaceId, environment, secretPath }) => {
      queryClient.invalidateQueries(
        dashboardKeys.getDashboardSecrets({ projectId: workspaceId, secretPath })
      );
      queryClient.invalidateQueries(
        secretKeys.getProjectSecret({ workspaceId, environment, secretPath })
      );
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

export const useMoveSecrets = ({
  options
}: {
  options?: Omit<MutationOptions<{}, {}, TMoveSecretsDTO>, "mutationFn">;
} = {}) => {
  const queryClient = useQueryClient();

  return useMutation<
    {
      isSourceUpdated: boolean;
      isDestinationUpdated: boolean;
    },
    {},
    TMoveSecretsDTO
  >({
    mutationFn: async ({
      sourceEnvironment,
      sourceSecretPath,
      projectSlug,
      destinationEnvironment,
      destinationSecretPath,
      secretIds,
      shouldOverwrite
    }) => {
      const { data } = await apiRequest.post<{
        isSourceUpdated: boolean;
        isDestinationUpdated: boolean;
      }>("/api/v3/secrets/move", {
        sourceEnvironment,
        sourceSecretPath,
        projectSlug,
        destinationEnvironment,
        destinationSecretPath,
        secretIds,
        shouldOverwrite
      });

      return data;
    },
    onSuccess: (_, { projectId, sourceEnvironment, sourceSecretPath }) => {
      queryClient.invalidateQueries(
        dashboardKeys.getDashboardSecrets({
          projectId,
          secretPath: sourceSecretPath
        })
      );
      queryClient.invalidateQueries(
        secretKeys.getProjectSecret({
          workspaceId: projectId,
          environment: sourceEnvironment,
          secretPath: sourceSecretPath
        })
      );
      queryClient.invalidateQueries(
        secretSnapshotKeys.list({
          environment: sourceEnvironment,
          workspaceId: projectId,
          directory: sourceSecretPath
        })
      );
      queryClient.invalidateQueries(
        secretSnapshotKeys.count({
          environment: sourceEnvironment,
          workspaceId: projectId,
          directory: sourceSecretPath
        })
      );
      queryClient.invalidateQueries(secretApprovalRequestKeys.count({ workspaceId: projectId }));
    },
    ...options
  });
};

export const createSecret = async (dto: TCreateSecretsV3DTO) => {
  const { data } = await apiRequest.post(`/api/v3/secrets/${dto.secretKey}`, dto);
  return data;
};

export const useBackfillSecretReference = () =>
  useMutation<{ message: string }, {}, { projectId: string }>({
    mutationFn: async ({ projectId }) => {
      const { data } = await apiRequest.post("/api/v3/secrets/backfill-secret-references", {
        projectId
      });
      return data.message;
    }
  });
