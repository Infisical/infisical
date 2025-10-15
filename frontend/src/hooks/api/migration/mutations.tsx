import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { dashboardKeys } from "@app/hooks/api/dashboard/queries";
import { secretKeys } from "@app/hooks/api/secrets/queries";

import { projectKeys } from "../projects";
import { externalMigrationQueryKeys } from "./queries";
import { TImportVaultSecretsDTO, TVaultExternalMigrationConfig, VaultImportStatus } from "./types";

export const useImportEnvKey = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ file, decryptionKey }: { file: File; decryptionKey: string }) => {
      const formData = new FormData();

      formData.append("decryptionKey", decryptionKey);
      formData.append("file", file);

      try {
        const response = await apiRequest.post("/api/v3/external-migration/env-key/", formData, {
          headers: {
            "Content-Type": "multipart/form-data"
          },
          onUploadProgress: (progressEvent) => {
            const percentCompleted = Math.round(
              (progressEvent.loaded * 100) / (progressEvent?.total || 1)
            );
            console.log(`Upload Progress: ${percentCompleted}%`);
          }
        });

        console.log("Upload successful:", response.data);
      } catch (error) {
        console.error("Upload failed:", error);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: projectKeys.getAllUserProjects()
      });
    }
  });
};

export const useImportVault = () => {
  return useMutation({
    mutationFn: async ({
      vaultAccessToken,
      vaultNamespace,
      vaultUrl,
      mappingType,
      gatewayId
    }: {
      vaultAccessToken: string;
      vaultNamespace?: string;
      vaultUrl: string;
      mappingType: string;
      gatewayId?: string;
    }) => {
      await apiRequest.post("/api/v3/external-migration/vault/", {
        vaultAccessToken,
        vaultNamespace,
        vaultUrl,
        mappingType,
        gatewayId
      });
    }
  });
};

export const useImportVaultSecrets = () => {
  const queryClient = useQueryClient();

  return useMutation<{ status: VaultImportStatus }, object, TImportVaultSecretsDTO>({
    mutationFn: async (dto) => {
      const { data } = await apiRequest.post<{ status: VaultImportStatus }>(
        "/api/v3/external-migration/vault/import-secrets",
        dto
      );
      return data;
    },
    onSuccess: (_, { projectId, environment, secretPath }) => {
      queryClient.invalidateQueries({ queryKey: dashboardKeys.all() });
      queryClient.invalidateQueries({
        queryKey: secretKeys.getProjectSecret({
          projectId,
          environment,
          secretPath
        })
      });
    }
  });
};

export const useCreateVaultExternalMigrationConfig = () => {
  const queryClient = useQueryClient();

  return useMutation<
    TVaultExternalMigrationConfig,
    Error,
    { connectionId: string; namespace: string }
  >({
    mutationFn: async ({ connectionId, namespace }) => {
      const { data } = await apiRequest.post<{ config: TVaultExternalMigrationConfig }>(
        "/api/v3/external-migration/vault/configs",
        {
          connectionId,
          namespace
        }
      );
      return data.config;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: externalMigrationQueryKeys.vaultConfigs()
      });
    }
  });
};

export const useUpdateVaultExternalMigrationConfig = () => {
  const queryClient = useQueryClient();

  return useMutation<
    TVaultExternalMigrationConfig,
    Error,
    { id: string; connectionId: string; namespace: string }
  >({
    mutationFn: async ({ id, connectionId, namespace }) => {
      const { data } = await apiRequest.put<{ config: TVaultExternalMigrationConfig }>(
        `/api/v3/external-migration/vault/configs/${id}`,
        {
          connectionId,
          namespace
        }
      );
      return data.config;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: externalMigrationQueryKeys.vaultConfigs()
      });
    }
  });
};

export const useDeleteVaultExternalMigrationConfig = () => {
  const queryClient = useQueryClient();

  return useMutation<TVaultExternalMigrationConfig, Error, { id: string }>({
    mutationFn: async ({ id }) => {
      const { data } = await apiRequest.delete<{ config: TVaultExternalMigrationConfig }>(
        `/api/v3/external-migration/vault/configs/${id}`
      );
      return data.config;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: externalMigrationQueryKeys.vaultConfigs()
      });
    }
  });
};
