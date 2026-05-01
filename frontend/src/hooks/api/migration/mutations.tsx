import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { dashboardKeys } from "@app/hooks/api/dashboard/queries";
import { secretKeys } from "@app/hooks/api/secrets/queries";

import { projectKeys } from "../projects";
import { externalMigrationQueryKeys } from "./queries";
import {
  ExternalMigrationImportStatus,
  TCreateExternalMigrationConfigDTO,
  TDeleteExternalMigrationConfigDTO,
  TExternalMigrationConfig,
  TImportDopplerSecretsDTO,
  TImportVaultSecretsDTO,
  TUpdateExternalMigrationConfigDTO
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

export const useImportVaultSecrets = () => {
  const queryClient = useQueryClient();

  return useMutation<{ status: ExternalMigrationImportStatus }, object, TImportVaultSecretsDTO>({
    mutationFn: async (dto) => {
      const { data } = await apiRequest.post<{ status: ExternalMigrationImportStatus }>(
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

export const useCreateExternalMigrationConfig = () => {
  const queryClient = useQueryClient();

  return useMutation<TExternalMigrationConfig, Error, TCreateExternalMigrationConfigDTO>({
    mutationFn: async ({ connectionId, input }) => {
      const { data } = await apiRequest.post<{ config: TExternalMigrationConfig }>(
        `/api/v3/external-migration/${input.provider}/configs`,
        { connectionId, input }
      );
      return data.config;
    },
    onSuccess: (_, { input }) => {
      queryClient.invalidateQueries({
        queryKey: externalMigrationQueryKeys.configs(input.provider)
      });
    }
  });
};

export const useUpdateExternalMigrationConfig = () => {
  const queryClient = useQueryClient();

  return useMutation<TExternalMigrationConfig, Error, TUpdateExternalMigrationConfigDTO>({
    mutationFn: async ({ id, connectionId, input }) => {
      const { data } = await apiRequest.put<{ config: TExternalMigrationConfig }>(
        `/api/v3/external-migration/${input.provider}/configs/${id}`,
        { connectionId, input }
      );
      return data.config;
    },
    onSuccess: (_, { input }) => {
      queryClient.invalidateQueries({
        queryKey: externalMigrationQueryKeys.configs(input.provider)
      });
    }
  });
};

export const useDeleteExternalMigrationConfig = () => {
  const queryClient = useQueryClient();

  return useMutation<TExternalMigrationConfig, Error, TDeleteExternalMigrationConfigDTO>({
    mutationFn: async ({ provider, id }) => {
      const { data } = await apiRequest.delete<{ config: TExternalMigrationConfig }>(
        `/api/v3/external-migration/${provider}/configs/${id}`
      );
      return data.config;
    },
    onSuccess: (_, { provider }) => {
      queryClient.invalidateQueries({
        queryKey: externalMigrationQueryKeys.configs(provider)
      });
    }
  });
};

export const useImportDopplerSecrets = () => {
  const queryClient = useQueryClient();

  return useMutation<{ status: string; imported: number }, Error, TImportDopplerSecretsDTO>({
    mutationFn: async (dto) => {
      const { data } = await apiRequest.post<{ status: string; imported: number }>(
        "/api/v3/external-migration/doppler/import-secrets",
        dto
      );
      return data;
    },
    onSuccess: (_, { targetProjectId, targetEnvironment, targetSecretPath }) => {
      queryClient.invalidateQueries({ queryKey: dashboardKeys.all() });
      queryClient.invalidateQueries({
        queryKey: secretKeys.getProjectSecret({
          projectId: targetProjectId,
          environment: targetEnvironment,
          secretPath: targetSecretPath
        })
      });
    }
  });
};
