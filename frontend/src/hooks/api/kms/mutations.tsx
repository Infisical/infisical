import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { kmsKeys } from "./queries";
import {
  AddExternalKmsType,
  ExternalKmsGcpSchemaType,
  ExternalKmsProvider,
  KmsGcpKeyFetchAuthType,
  KmsType,
  UpdateExternalKmsType
} from "./types";

export const useAddExternalKms = (orgId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, description, configuration }: AddExternalKmsType) => {
      const providerPath = configuration.type === ExternalKmsProvider.Aws ? "aws" : "gcp";
      const { data } = await apiRequest.post(`/api/v1/external-kms/${providerPath}`, {
        name,
        description,
        configuration: configuration.inputs
      });

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: kmsKeys.getExternalKmsList(orgId) });
    }
  });
};

export const useUpdateExternalKms = (orgId: string, provider: ExternalKmsProvider) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      kmsId,
      name,
      description,
      configuration
    }: {
      kmsId: string;
    } & UpdateExternalKmsType) => {
      const { data } = await apiRequest.patch(`/api/v1/external-kms/${provider}/${kmsId}`, {
        name,
        description,
        configuration: configuration?.inputs
      });

      return data;
    },
    onSuccess: (_, { kmsId }) => {
      queryClient.invalidateQueries({ queryKey: kmsKeys.getExternalKmsList(orgId) });
      queryClient.invalidateQueries({ queryKey: kmsKeys.getExternalKmsById(kmsId) });
    }
  });
};

export const useRemoveExternalKms = (orgId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ kmsId, provider }: { kmsId: string; provider: ExternalKmsProvider }) => {
      const { data } = await apiRequest.delete(`/api/v1/external-kms/${provider}/${kmsId}`);

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: kmsKeys.getExternalKmsList(orgId) });
    }
  });
};

export const useUpdateProjectKms = (projectId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      updatedData: { type: KmsType.Internal } | { type: KmsType.External; kmsId: string }
    ) => {
      const { data } = await apiRequest.patch(`/api/v1/projects/${projectId}/kms`, {
        kms: updatedData
      });

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: kmsKeys.getActiveProjectKms(projectId) });
    }
  });
};

export const useLoadProjectKmsBackup = (projectId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (backup: string) => {
      const { data } = await apiRequest.post(`/api/v1/projects/${projectId}/kms/backup`, {
        backup
      });

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: kmsKeys.getActiveProjectKms(projectId) });
    }
  });
};

export const useExternalKmsFetchGcpKeys = (orgId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      gcpRegion,
      ...rest
    }: Pick<ExternalKmsGcpSchemaType, "gcpRegion"> &
      (
        | (Pick<ExternalKmsGcpSchemaType, KmsGcpKeyFetchAuthType.Credential> & {
            [KmsGcpKeyFetchAuthType.Kms]?: never;
          })
        | {
            [KmsGcpKeyFetchAuthType.Kms]: string;
            [KmsGcpKeyFetchAuthType.Credential]?: never;
          }
      )): Promise<{ keys: string[] }> => {
      const {
        [KmsGcpKeyFetchAuthType.Credential]: credential,
        [KmsGcpKeyFetchAuthType.Kms]: kmsId
      } = rest;

      if ((credential && kmsId) || (!credential && !kmsId)) {
        throw new Error(
          `Either '${KmsGcpKeyFetchAuthType.Credential}' or '${KmsGcpKeyFetchAuthType.Kms}' must be provided, but not both.`
        );
      }

      const requestBody = credential
        ? {
            authMethod: KmsGcpKeyFetchAuthType.Credential,
            region: gcpRegion,
            credential
          }
        : {
            authMethod: KmsGcpKeyFetchAuthType.Kms,
            region: gcpRegion,
            kmsId
          };

      const { data } = await apiRequest.post("/api/v1/external-kms/gcp/keys", requestBody);

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: kmsKeys.getExternalKmsList(orgId) });
    }
  });
};
