import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { secretSyncKeys } from "@app/hooks/api/secretSyncs/queries";
import {
  TCreateSecretSyncDTO,
  TDeleteSecretSyncDTO,
  TSecretSyncResponse,
  TTriggerSecretSyncImportSecretsDTO,
  TTriggerSecretSyncRemoveSecretsDTO,
  TTriggerSecretSyncSyncSecretsDTO,
  TUpdateSecretSyncDTO
} from "@app/hooks/api/secretSyncs/types";

export const useCreateSecretSync = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ destination, ...params }: TCreateSecretSyncDTO) => {
      const { data } = await apiRequest.post<TSecretSyncResponse>(
        `/api/v1/secret-syncs/${destination}`,
        params
      );

      return data.secretSync;
    },
    onSuccess: (_, { projectId }) =>
      queryClient.invalidateQueries({ queryKey: secretSyncKeys.list(projectId) })
  });
};

export const useUpdateSecretSync = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ syncId, destination, ...params }: TUpdateSecretSyncDTO) => {
      const { data } = await apiRequest.patch<TSecretSyncResponse>(
        `/api/v1/secret-syncs/${destination}/${syncId}`,
        params
      );

      return data.secretSync;
    },
    onSuccess: (updatedSecretSync, { syncId, destination, projectId }) => {
      queryClient.setQueryData(secretSyncKeys.byId(destination, syncId), updatedSecretSync);
      queryClient.invalidateQueries({ queryKey: secretSyncKeys.list(projectId) });
    }
  });
};

export const useDeleteSecretSync = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ syncId, destination, removeSecrets }: TDeleteSecretSyncDTO) => {
      const { data } = await apiRequest.delete(`/api/v1/secret-syncs/${destination}/${syncId}`, {
        params: { removeSecrets }
      });

      return data;
    },
    onSuccess: (_, { syncId, destination, projectId }) => {
      queryClient.invalidateQueries({ queryKey: secretSyncKeys.list(projectId) });
      queryClient.invalidateQueries({ queryKey: secretSyncKeys.byId(destination, syncId) });
    }
  });
};

export const useTriggerSecretSyncSyncSecrets = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ syncId, destination }: TTriggerSecretSyncSyncSecretsDTO) => {
      const { data } = await apiRequest.post(
        `/api/v1/secret-syncs/${destination}/${syncId}/sync-secrets`,
        {}
      );

      return data;
    },
    onSuccess: (_, { syncId, destination, projectId }) => {
      queryClient.invalidateQueries({ queryKey: secretSyncKeys.list(projectId) });
      queryClient.invalidateQueries({ queryKey: secretSyncKeys.byId(destination, syncId) });
    }
  });
};

export const useTriggerSecretSyncImportSecrets = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      syncId,
      destination,
      importBehavior
    }: TTriggerSecretSyncImportSecretsDTO) => {
      const { data } = await apiRequest.post(
        `/api/v1/secret-syncs/${destination}/${syncId}/import-secrets?importBehavior=${importBehavior}`,
        {}
      );

      return data;
    },
    onSuccess: (_, { syncId, destination, projectId }) => {
      queryClient.invalidateQueries({ queryKey: secretSyncKeys.list(projectId) });
      queryClient.invalidateQueries({ queryKey: secretSyncKeys.byId(destination, syncId) });
    }
  });
};

export const useTriggerSecretSyncRemoveSecrets = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ syncId, destination }: TTriggerSecretSyncRemoveSecretsDTO) => {
      const { data } = await apiRequest.post(
        `/api/v1/secret-syncs/${destination}/${syncId}/remove-secrets`,
        {}
      );

      return data;
    },
    onSuccess: (_, { syncId, destination, projectId }) => {
      queryClient.invalidateQueries({ queryKey: secretSyncKeys.list(projectId) });
      queryClient.invalidateQueries({ queryKey: secretSyncKeys.byId(destination, syncId) });
    }
  });
};
