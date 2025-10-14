import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { dashboardKeys } from "@app/hooks/api/dashboard/queries";
import { secretKeys } from "@app/hooks/api/secrets/queries";

import { projectKeys } from "../projects";
import { externalMigrationQueryKeys } from "./queries";
import {
  ExternalMigrationProviders,
  TExternalMigrationConfig,
  TImportVaultSecretsDTO
} from "./types";

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

export const useUpdateExternalMigrationConfig = (platform: ExternalMigrationProviders) => {
  const queryClient = useQueryClient();

  return useMutation<TExternalMigrationConfig, Error, { connectionId: string | null }>({
    mutationFn: async ({ connectionId }: { connectionId: string | null }) => {
      const { data } = await apiRequest.put<{ config: TExternalMigrationConfig }>(
        "/api/v3/external-migration/config",
        {
          connectionId,
          platform
        }
      );

      return data.config;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: externalMigrationQueryKeys.config(platform)
      });
    }
  });
};

export const useImportVaultSecrets = () => {
  const queryClient = useQueryClient();

  return useMutation<{ message: string }, object, TImportVaultSecretsDTO>({
    mutationFn: async (dto) => {
      const { data } = await apiRequest.post<{ message: string }>(
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
