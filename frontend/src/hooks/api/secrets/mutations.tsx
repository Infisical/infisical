import { MutationOptions, useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { dashboardKeys } from "@app/hooks/api/dashboard/queries";

import { commitKeys } from "../folderCommits/queries";
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
  options?: Omit<MutationOptions<object, object, TCreateSecretsV3DTO>, "mutationFn">;
} = {}) => {
  const queryClient = useQueryClient();
  return useMutation<object, object, TCreateSecretsV3DTO>({
    mutationFn: async ({
      secretPath = "/",
      type,
      environment,
      workspaceId,
      secretKey,
      secretValue,
      secretComment,
      skipMultilineEncoding,
      tagIds
    }) => {
      const { data } = await apiRequest.post(`/api/v3/secrets/raw/${secretKey}`, {
        secretPath,
        type,
        environment,
        workspaceId,
        secretValue,
        secretComment,
        skipMultilineEncoding,
        tagIds
      });
      return data;
    },
    onSuccess: (_, { workspaceId, environment, secretPath }) => {
      queryClient.invalidateQueries({
        queryKey: dashboardKeys.getDashboardSecrets({ projectId: workspaceId, secretPath })
      });
      queryClient.invalidateQueries({
        queryKey: secretKeys.getProjectSecret({ workspaceId, environment, secretPath })
      });
      queryClient.invalidateQueries({
        queryKey: secretSnapshotKeys.list({ environment, workspaceId, directory: secretPath })
      });
      queryClient.invalidateQueries({
        queryKey: secretSnapshotKeys.count({ environment, workspaceId, directory: secretPath })
      });
      queryClient.invalidateQueries({
        queryKey: commitKeys.count({ workspaceId, environment, directory: secretPath })
      });
      queryClient.invalidateQueries({
        queryKey: commitKeys.history({ workspaceId, environment, directory: secretPath })
      });
      queryClient.invalidateQueries({ queryKey: secretApprovalRequestKeys.count({ workspaceId }) });
    },
    ...options
  });
};

export const useUpdateSecretV3 = ({
  options
}: {
  options?: Omit<MutationOptions<object, object, TUpdateSecretsV3DTO>, "mutationFn">;
} = {}) => {
  const queryClient = useQueryClient();
  return useMutation<object, object, TUpdateSecretsV3DTO>({
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
      secretReminderRecipients,
      newSecretName,
      skipMultilineEncoding,
      secretMetadata
    }) => {
      const { data } = await apiRequest.patch(`/api/v3/secrets/raw/${secretKey}`, {
        workspaceId,
        environment,
        type,
        secretReminderNote,
        secretReminderRepeatDays,
        secretReminderRecipients,
        secretPath,
        skipMultilineEncoding,
        newSecretName,
        secretComment,
        tagIds,
        secretValue,
        secretMetadata
      });
      return data;
    },
    onSuccess: (_, { workspaceId, environment, secretPath }) => {
      queryClient.invalidateQueries({
        queryKey: dashboardKeys.getDashboardSecrets({ projectId: workspaceId, secretPath })
      });
      queryClient.invalidateQueries({
        queryKey: secretKeys.getProjectSecret({ workspaceId, environment, secretPath })
      });
      queryClient.invalidateQueries({
        queryKey: secretSnapshotKeys.list({ environment, workspaceId, directory: secretPath })
      });
      queryClient.invalidateQueries({
        queryKey: secretSnapshotKeys.count({ environment, workspaceId, directory: secretPath })
      });
      queryClient.invalidateQueries({
        queryKey: commitKeys.count({ workspaceId, environment, directory: secretPath })
      });
      queryClient.invalidateQueries({
        queryKey: commitKeys.history({ workspaceId, environment, directory: secretPath })
      });
      queryClient.invalidateQueries({ queryKey: secretApprovalRequestKeys.count({ workspaceId }) });
    },
    ...options
  });
};

export const useDeleteSecretV3 = ({
  options
}: {
  options?: Omit<MutationOptions<object, object, TDeleteSecretsV3DTO>, "mutationFn">;
} = {}) => {
  const queryClient = useQueryClient();

  return useMutation<object, object, TDeleteSecretsV3DTO>({
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
      queryClient.invalidateQueries({
        queryKey: dashboardKeys.getDashboardSecrets({ projectId: workspaceId, secretPath })
      });
      queryClient.invalidateQueries({
        queryKey: secretKeys.getProjectSecret({ workspaceId, environment, secretPath })
      });
      queryClient.invalidateQueries({
        queryKey: secretSnapshotKeys.list({ environment, workspaceId, directory: secretPath })
      });
      queryClient.invalidateQueries({
        queryKey: secretSnapshotKeys.count({ environment, workspaceId, directory: secretPath })
      });
      queryClient.invalidateQueries({
        queryKey: commitKeys.count({ workspaceId, environment, directory: secretPath })
      });
      queryClient.invalidateQueries({
        queryKey: commitKeys.history({ workspaceId, environment, directory: secretPath })
      });
      queryClient.invalidateQueries({ queryKey: secretApprovalRequestKeys.count({ workspaceId }) });
    },
    ...options
  });
};

export const useCreateSecretBatch = ({
  options
}: {
  options?: Omit<MutationOptions<object, object, TCreateSecretBatchDTO>, "mutationFn">;
} = {}) => {
  const queryClient = useQueryClient();

  return useMutation<object, object, TCreateSecretBatchDTO>({
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
      queryClient.invalidateQueries({
        queryKey: dashboardKeys.getDashboardSecrets({ projectId: workspaceId, secretPath })
      });
      queryClient.invalidateQueries({
        queryKey: secretKeys.getProjectSecret({ workspaceId, environment, secretPath })
      });
      queryClient.invalidateQueries({
        queryKey: secretSnapshotKeys.list({ environment, workspaceId, directory: secretPath })
      });
      queryClient.invalidateQueries({
        queryKey: secretSnapshotKeys.count({ environment, workspaceId, directory: secretPath })
      });
      queryClient.invalidateQueries({
        queryKey: commitKeys.count({ workspaceId, environment, directory: secretPath })
      });
      queryClient.invalidateQueries({
        queryKey: commitKeys.history({ workspaceId, environment, directory: secretPath })
      });
      queryClient.invalidateQueries({ queryKey: secretApprovalRequestKeys.count({ workspaceId }) });
    },
    ...options
  });
};

export const useUpdateSecretBatch = ({
  options
}: {
  options?: Omit<MutationOptions<object, object, TUpdateSecretBatchDTO>, "mutationFn">;
} = {}) => {
  const queryClient = useQueryClient();

  return useMutation<object, object, TUpdateSecretBatchDTO>({
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
      queryClient.invalidateQueries({
        queryKey: dashboardKeys.getDashboardSecrets({ projectId: workspaceId, secretPath })
      });
      queryClient.invalidateQueries({
        queryKey: secretKeys.getProjectSecret({ workspaceId, environment, secretPath })
      });
      queryClient.invalidateQueries({
        queryKey: secretSnapshotKeys.list({ environment, workspaceId, directory: secretPath })
      });
      queryClient.invalidateQueries({
        queryKey: secretSnapshotKeys.count({ environment, workspaceId, directory: secretPath })
      });
      queryClient.invalidateQueries({
        queryKey: commitKeys.count({ workspaceId, environment, directory: secretPath })
      });
      queryClient.invalidateQueries({
        queryKey: commitKeys.history({ workspaceId, environment, directory: secretPath })
      });
      queryClient.invalidateQueries({ queryKey: secretApprovalRequestKeys.count({ workspaceId }) });
    },
    ...options
  });
};

export const useDeleteSecretBatch = ({
  options
}: {
  options?: Omit<MutationOptions<object, object, TDeleteSecretBatchDTO>, "mutationFn">;
} = {}) => {
  const queryClient = useQueryClient();

  return useMutation<object, object, TDeleteSecretBatchDTO>({
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
      queryClient.invalidateQueries({
        queryKey: dashboardKeys.getDashboardSecrets({ projectId: workspaceId, secretPath })
      });
      queryClient.invalidateQueries({
        queryKey: secretKeys.getProjectSecret({ workspaceId, environment, secretPath })
      });
      queryClient.invalidateQueries({
        queryKey: secretSnapshotKeys.list({ environment, workspaceId, directory: secretPath })
      });
      queryClient.invalidateQueries({
        queryKey: secretSnapshotKeys.count({ environment, workspaceId, directory: secretPath })
      });
      queryClient.invalidateQueries({
        queryKey: commitKeys.count({ workspaceId, environment, directory: secretPath })
      });
      queryClient.invalidateQueries({
        queryKey: commitKeys.history({ workspaceId, environment, directory: secretPath })
      });
      queryClient.invalidateQueries({ queryKey: secretApprovalRequestKeys.count({ workspaceId }) });
    },
    ...options
  });
};

export const useMoveSecrets = ({
  options
}: {
  options?: Omit<MutationOptions<object, object, TMoveSecretsDTO>, "mutationFn">;
} = {}) => {
  const queryClient = useQueryClient();

  return useMutation<
    {
      isSourceUpdated: boolean;
      isDestinationUpdated: boolean;
    },
    object,
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
      queryClient.invalidateQueries({
        queryKey: dashboardKeys.getDashboardSecrets({
          projectId,
          secretPath: sourceSecretPath
        })
      });
      queryClient.invalidateQueries({
        queryKey: secretKeys.getProjectSecret({
          workspaceId: projectId,
          environment: sourceEnvironment,
          secretPath: sourceSecretPath
        })
      });
      queryClient.invalidateQueries({
        queryKey: secretSnapshotKeys.list({
          environment: sourceEnvironment,
          workspaceId: projectId,
          directory: sourceSecretPath
        })
      });
      queryClient.invalidateQueries({
        queryKey: secretSnapshotKeys.count({
          environment: sourceEnvironment,
          workspaceId: projectId,
          directory: sourceSecretPath
        })
      });
      queryClient.invalidateQueries({
        queryKey: commitKeys.count({
          workspaceId: projectId,
          environment: sourceEnvironment,
          directory: sourceSecretPath
        })
      });
      queryClient.invalidateQueries({
        queryKey: commitKeys.history({
          workspaceId: projectId,
          environment: sourceEnvironment,
          directory: sourceSecretPath
        })
      });
      queryClient.invalidateQueries({
        queryKey: secretApprovalRequestKeys.count({ workspaceId: projectId })
      });
    },
    ...options
  });
};

export const createSecret = async (dto: TCreateSecretsV3DTO) => {
  const { data } = await apiRequest.post(`/api/v3/secrets/${dto.secretKey}`, dto);
  return data;
};

export const useBackfillSecretReference = () =>
  useMutation<{ message: string }, object, { projectId: string }>({
    mutationFn: async ({ projectId }) => {
      const { data } = await apiRequest.post("/api/v3/secrets/backfill-secret-references", {
        projectId
      });
      return data.message;
    }
  });
