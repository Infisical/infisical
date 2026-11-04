import { MutationOptions, useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { dashboardKeys } from "@app/hooks/api/dashboard/queries";
import {
  PendingChanges,
  PendingSecretCreate,
  PendingSecretDelete,
  PendingSecretUpdate
} from "@app/pages/secret-manager/SecretDashboardPage/SecretMainPage.store";

import { commitKeys } from "../folderCommits/queries";
import { secretApprovalRequestKeys } from "../secretApprovalRequest/queries";
import { PendingAction } from "../secretFolders/types";
import { secretKeys } from "./queries";
import {
  TCreateCommitResponse,
  TCreateSecretBatchDTO,
  TCreateSecretsV3DTO,
  TDeleteSecretBatchDTO,
  TDeleteSecretsV3DTO,
  TDuplicateSecretDTO,
  TDuplicateSecretResponse,
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
      projectId,
      secretKey,
      secretValue,
      secretComment,
      skipMultilineEncoding,
      tagIds,
      secretMetadata
    }) => {
      const { data } = await apiRequest.post(`/api/v4/secrets/${encodeURIComponent(secretKey)}`, {
        secretPath,
        type,
        environment,
        projectId,
        secretValue,
        secretComment,
        skipMultilineEncoding,
        tagIds,
        secretMetadata
      });
      return data;
    },
    onSuccess: (_, { projectId, environment, secretPath }) => {
      queryClient.invalidateQueries({
        queryKey: dashboardKeys.getDashboardSecrets({ projectId, secretPath })
      });
      queryClient.invalidateQueries({
        predicate: (query) =>
          (query.queryKey[0] as { projectId?: string })?.projectId === projectId &&
          (query.queryKey[1] === "secrets-import-sec" ||
            query.queryKey[1] === "imported-folders-all-envs")
      });
      queryClient.invalidateQueries({
        queryKey: secretKeys.getProjectSecret({ projectId, environment, secretPath })
      });
      queryClient.invalidateQueries({
        queryKey: commitKeys.count({ projectId, environment, directory: secretPath })
      });
      queryClient.invalidateQueries({
        queryKey: commitKeys.history({ projectId, environment, directory: secretPath })
      });
      queryClient.invalidateQueries({ queryKey: secretApprovalRequestKeys.count({ projectId }) });
      queryClient.invalidateQueries({
        queryKey: secretApprovalRequestKeys.listAllForProject({ projectId })
      });
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
      projectId,
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
      const { data } = await apiRequest.patch(`/api/v4/secrets/${encodeURIComponent(secretKey)}`, {
        projectId,
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
    onSuccess: (_, { projectId, environment, secretPath }) => {
      queryClient.invalidateQueries({
        queryKey: dashboardKeys.getDashboardSecrets({ projectId, secretPath })
      });
      queryClient.invalidateQueries({
        predicate: (query) =>
          (query.queryKey[0] as { projectId?: string })?.projectId === projectId &&
          (query.queryKey[1] === "secrets-import-sec" ||
            query.queryKey[1] === "imported-folders-all-envs")
      });
      queryClient.invalidateQueries({
        queryKey: secretKeys.getProjectSecret({ projectId, environment, secretPath })
      });
      queryClient.invalidateQueries({
        predicate: (query) =>
          query.queryKey[0] === "secret-reference-tree" &&
          (query.queryKey[1] as { projectId?: string })?.projectId === projectId
      });
      queryClient.invalidateQueries({
        queryKey: commitKeys.count({ projectId, environment, directory: secretPath })
      });
      queryClient.invalidateQueries({
        queryKey: commitKeys.history({ projectId, environment, directory: secretPath })
      });
      queryClient.invalidateQueries({ queryKey: secretApprovalRequestKeys.count({ projectId }) });
      queryClient.invalidateQueries({
        queryKey: secretApprovalRequestKeys.listAllForProject({ projectId })
      });
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
    mutationFn: async ({ secretPath = "/", type, environment, projectId, secretKey, secretId }) => {
      const { data } = await apiRequest.delete(`/api/v4/secrets/${encodeURIComponent(secretKey)}`, {
        data: {
          projectId,
          environment,
          type,
          secretPath,
          secretId
        }
      });
      return data;
    },
    onSuccess: (_, { projectId, environment, secretPath }) => {
      queryClient.invalidateQueries({
        queryKey: dashboardKeys.getDashboardSecrets({ projectId, secretPath })
      });
      queryClient.invalidateQueries({
        predicate: (query) =>
          (query.queryKey[0] as { projectId?: string })?.projectId === projectId &&
          (query.queryKey[1] === "secrets-import-sec" ||
            query.queryKey[1] === "imported-folders-all-envs")
      });
      queryClient.invalidateQueries({
        queryKey: secretKeys.getProjectSecret({ projectId, environment, secretPath })
      });
      queryClient.invalidateQueries({
        queryKey: commitKeys.count({ projectId, environment, directory: secretPath })
      });
      queryClient.invalidateQueries({
        queryKey: commitKeys.history({ projectId, environment, directory: secretPath })
      });
      queryClient.invalidateQueries({ queryKey: secretApprovalRequestKeys.count({ projectId }) });
      queryClient.invalidateQueries({
        queryKey: secretApprovalRequestKeys.listAllForProject({ projectId })
      });
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
    mutationFn: async ({ secretPath = "/", projectId, environment, secrets }) => {
      const { data } = await apiRequest.post("/api/v4/secrets/batch", {
        projectId,
        environment,
        secretPath,
        secrets
      });
      return data;
    },
    onSuccess: (_, { projectId, environment, secretPath }) => {
      queryClient.invalidateQueries({
        queryKey: dashboardKeys.getDashboardSecrets({ projectId, secretPath })
      });
      queryClient.invalidateQueries({
        predicate: (query) =>
          (query.queryKey[0] as { projectId?: string })?.projectId === projectId &&
          (query.queryKey[1] === "secrets-import-sec" ||
            query.queryKey[1] === "imported-folders-all-envs")
      });
      queryClient.invalidateQueries({
        queryKey: secretKeys.getProjectSecret({ projectId, environment, secretPath })
      });
      queryClient.invalidateQueries({
        queryKey: commitKeys.count({ projectId, environment, directory: secretPath })
      });
      queryClient.invalidateQueries({
        queryKey: commitKeys.history({ projectId, environment, directory: secretPath })
      });
      queryClient.invalidateQueries({ queryKey: secretApprovalRequestKeys.count({ projectId }) });
      queryClient.invalidateQueries({
        queryKey: secretApprovalRequestKeys.listAllForProject({ projectId })
      });
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
    mutationFn: async ({ secretPath = "/", projectId, environment, secrets }) => {
      const { data } = await apiRequest.patch("/api/v4/secrets/batch", {
        projectId,
        environment,
        secretPath,
        secrets
      });
      return data;
    },
    onSuccess: (_, { projectId, environment, secretPath }) => {
      queryClient.invalidateQueries({
        queryKey: dashboardKeys.getDashboardSecrets({ projectId, secretPath })
      });
      queryClient.invalidateQueries({
        predicate: (query) =>
          (query.queryKey[0] as { projectId?: string })?.projectId === projectId &&
          (query.queryKey[1] === "secrets-import-sec" ||
            query.queryKey[1] === "imported-folders-all-envs")
      });
      queryClient.invalidateQueries({
        queryKey: secretKeys.getProjectSecret({ projectId, environment, secretPath })
      });
      queryClient.invalidateQueries({
        predicate: (query) =>
          query.queryKey[0] === "secret-reference-tree" &&
          (query.queryKey[1] as { projectId?: string })?.projectId === projectId
      });
      queryClient.invalidateQueries({
        queryKey: commitKeys.count({ projectId, environment, directory: secretPath })
      });
      queryClient.invalidateQueries({
        queryKey: commitKeys.history({ projectId, environment, directory: secretPath })
      });
      queryClient.invalidateQueries({ queryKey: secretApprovalRequestKeys.count({ projectId }) });
      queryClient.invalidateQueries({
        queryKey: secretApprovalRequestKeys.listAllForProject({ projectId })
      });
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
    mutationFn: async ({ secretPath = "/", projectId, environment, secrets }) => {
      const { data } = await apiRequest.delete("/api/v4/secrets/batch", {
        data: {
          projectId,
          environment,
          secretPath,
          secrets
        }
      });
      return data;
    },
    onSuccess: (_, { projectId, environment, secretPath }) => {
      queryClient.invalidateQueries({
        queryKey: dashboardKeys.getDashboardSecrets({ projectId, secretPath })
      });
      queryClient.invalidateQueries({
        predicate: (query) =>
          (query.queryKey[0] as { projectId?: string })?.projectId === projectId &&
          (query.queryKey[1] === "secrets-import-sec" ||
            query.queryKey[1] === "imported-folders-all-envs")
      });
      queryClient.invalidateQueries({
        queryKey: secretKeys.getProjectSecret({ projectId, environment, secretPath })
      });
      queryClient.invalidateQueries({
        queryKey: commitKeys.count({ projectId, environment, directory: secretPath })
      });
      queryClient.invalidateQueries({
        queryKey: commitKeys.history({ projectId, environment, directory: secretPath })
      });
      queryClient.invalidateQueries({ queryKey: secretApprovalRequestKeys.count({ projectId }) });
      queryClient.invalidateQueries({
        queryKey: secretApprovalRequestKeys.listAllForProject({ projectId })
      });
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
      destinationEnvironment,
      destinationSecretPath,
      secretIds,
      shouldOverwrite,
      projectSlug,
      projectId
    }) => {
      const { data } = await apiRequest.post<{
        isSourceUpdated: boolean;
        isDestinationUpdated: boolean;
      }>("/api/v4/secrets/move", {
        sourceEnvironment,
        sourceSecretPath,
        destinationEnvironment,
        destinationSecretPath,
        secretIds,
        shouldOverwrite,
        projectSlug,
        projectId
      });

      return data;
    },
    onSuccess: (
      _,
      {
        projectId,
        sourceEnvironment,
        sourceSecretPath,
        destinationEnvironment,
        destinationSecretPath
      }
    ) => {
      queryClient.invalidateQueries({
        queryKey: dashboardKeys.getDashboardSecrets({
          projectId,
          secretPath: sourceSecretPath
        })
      });
      if (destinationSecretPath !== sourceSecretPath) {
        queryClient.invalidateQueries({
          queryKey: dashboardKeys.getDashboardSecrets({
            projectId,
            secretPath: destinationSecretPath
          })
        });
      }
      queryClient.invalidateQueries({
        queryKey: secretKeys.getProjectSecret({
          projectId,
          environment: sourceEnvironment,
          secretPath: sourceSecretPath
        })
      });
      if (
        destinationEnvironment !== sourceEnvironment ||
        destinationSecretPath !== sourceSecretPath
      ) {
        queryClient.invalidateQueries({
          queryKey: secretKeys.getProjectSecret({
            projectId,
            environment: destinationEnvironment,
            secretPath: destinationSecretPath
          })
        });
      }
      queryClient.invalidateQueries({
        queryKey: commitKeys.count({
          projectId,
          environment: sourceEnvironment,
          directory: sourceSecretPath
        })
      });
      queryClient.invalidateQueries({
        queryKey: commitKeys.history({
          projectId,
          environment: sourceEnvironment,
          directory: sourceSecretPath
        })
      });
      queryClient.invalidateQueries({
        queryKey: secretApprovalRequestKeys.count({ projectId })
      });
      queryClient.invalidateQueries({
        queryKey: secretApprovalRequestKeys.listAllForProject({ projectId })
      });
    },
    ...options
  });
};

export const useDuplicateSecret = ({
  options
}: {
  options?: Omit<
    MutationOptions<TDuplicateSecretResponse, object, TDuplicateSecretDTO>,
    "mutationFn"
  >;
} = {}) => {
  const queryClient = useQueryClient();

  return useMutation<TDuplicateSecretResponse, object, TDuplicateSecretDTO>({
    mutationFn: async (dto) => {
      const { data } = await apiRequest.post<TDuplicateSecretResponse>(
        "/api/v4/secrets/duplicate",
        dto
      );
      return data;
    },
    onSuccess: (data, { projectId, destinationEnvironment, destinationSecretPath }) => {
      queryClient.invalidateQueries({
        queryKey: dashboardKeys.getDashboardSecrets({
          projectId,
          secretPath: destinationSecretPath
        })
      });
      queryClient.invalidateQueries({
        queryKey: secretKeys.getProjectSecret({
          projectId,
          environment: destinationEnvironment,
          secretPath: destinationSecretPath
        })
      });
      queryClient.invalidateQueries({
        queryKey: commitKeys.count({
          projectId,
          environment: destinationEnvironment,
          directory: destinationSecretPath
        })
      });
      queryClient.invalidateQueries({
        queryKey: commitKeys.history({
          projectId,
          environment: destinationEnvironment,
          directory: destinationSecretPath
        })
      });
      if (data.results.some((result) => "approval" in result)) {
        queryClient.invalidateQueries({ queryKey: secretApprovalRequestKeys.count({ projectId }) });
        queryClient.invalidateQueries({
          queryKey: secretApprovalRequestKeys.listAllForProject({ projectId })
        });
      }
    },
    ...options
  });
};

export const createSecret = async (dto: TCreateSecretsV3DTO) => {
  const { data } = await apiRequest.post(
    `/api/v4/secrets/${encodeURIComponent(dto.secretKey)}`,
    dto
  );
  return data;
};

export const useCreateCommit = () => {
  const queryClient = useQueryClient();
  return useMutation<
    TCreateCommitResponse,
    object,
    {
      projectId: string;
      environment: string;
      secretPath: string;
      pendingChanges: PendingChanges;
      message: string;
    }
  >({
    mutationFn: async ({ projectId, environment, secretPath, pendingChanges, message }) => {
      const secretCreates: PendingSecretCreate[] = [];
      const secretUpdates: PendingSecretUpdate[] = [];
      const secretDeletes: PendingSecretDelete[] = [];
      pendingChanges.secrets.forEach((change) => {
        if (change.type === PendingAction.Create) secretCreates.push(change);
        else if (change.type === PendingAction.Update) secretUpdates.push(change);
        else secretDeletes.push(change);
      });

      const { data } = await apiRequest.post<TCreateCommitResponse>("/api/v1/pit/batch/commit", {
        projectId,
        environment,
        secretPath,
        message: message || undefined,
        changes: {
          secrets: {
            create: secretCreates.map((change) => ({
              secretKey: change.secretKey,
              secretValue: change.secretValue,
              secretComment: change.secretComment,
              skipMultilineEncoding: change.skipMultilineEncoding ?? undefined,
              tagIds: change.tags?.map((tag) => tag.id),
              secretMetadata: change.secretMetadata
            })),
            update: secretUpdates.map((change) => ({
              secretKey: change.secretKey,
              newSecretName:
                change.newSecretName && change.newSecretName !== change.secretKey
                  ? change.newSecretName
                  : undefined,
              secretValue: change.secretValue,
              secretComment: change.secretComment ?? change.originalComment,
              skipMultilineEncoding: change.skipMultilineEncoding ?? undefined,
              tagIds: (change.tags ?? change.originalTags)?.map((tag) => tag.id),
              secretMetadata: change.secretMetadata
            })),
            delete: secretDeletes.map((change) => ({ secretKey: change.secretKey }))
          },
          folders: {
            create: pendingChanges.folders
              .filter((change) => change.type === PendingAction.Create)
              .map((change) => ({
                folderName: change.folderName,
                description: change.description || undefined
              })),
            update: pendingChanges.folders
              .filter((change) => change.type === PendingAction.Update)
              .map((change) => ({
                id: change.id,
                folderName: change.folderName,
                description: change.description === "" ? null : change.description
              })),
            delete: pendingChanges.folders
              .filter((change) => change.type === PendingAction.Delete)
              .map((change) => ({ id: change.id, folderName: change.folderName }))
          }
        }
      });
      return data;
    },
    onSuccess: (_, { projectId, environment, secretPath }) => {
      queryClient.invalidateQueries({
        queryKey: dashboardKeys.getDashboardSecrets({ projectId, secretPath })
      });
      queryClient.invalidateQueries({
        predicate: (query) =>
          (query.queryKey[0] as { projectId?: string })?.projectId === projectId &&
          (query.queryKey[1] === "secrets-import-sec" ||
            query.queryKey[1] === "imported-folders-all-envs")
      });
      queryClient.invalidateQueries({
        queryKey: secretKeys.getProjectSecret({ projectId, environment, secretPath })
      });
      queryClient.invalidateQueries({
        predicate: (query) =>
          query.queryKey[0] === "secret-reference-tree" &&
          (query.queryKey[1] as { projectId?: string })?.projectId === projectId
      });
      queryClient.invalidateQueries({
        queryKey: commitKeys.count({ projectId, environment, directory: secretPath })
      });
      queryClient.invalidateQueries({
        queryKey: commitKeys.history({ projectId, environment, directory: secretPath })
      });
      queryClient.invalidateQueries({ queryKey: secretApprovalRequestKeys.count({ projectId }) });
      queryClient.invalidateQueries({
        queryKey: secretApprovalRequestKeys.listAllForProject({ projectId })
      });
    }
  });
};

export const useRedactSecretValue = () => {
  const queryClient = useQueryClient();
  return useMutation<object, object, { versionId: string; secretId: string }>({
    mutationFn: async ({ versionId }) => {
      const { data } = await apiRequest.delete(`/api/v2/secret-versions/${versionId}/redact-value`);
      return data;
    },
    onSuccess: (_, { secretId }) => {
      queryClient.invalidateQueries({ queryKey: secretKeys.getSecretVersion(secretId) });
    }
  });
};
