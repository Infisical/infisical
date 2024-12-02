import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { kmsKeys } from "./queries";
import {
  AddExternalKmsType,
  ExternalKmsGcpSchemaType,
  KmsType,
  UpdateExternalKmsType
} from "./types";

export const useAddExternalKms = (orgId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, description, provider }: AddExternalKmsType) => {
      const { data } = await apiRequest.post("/api/v1/external-kms", {
        name,
        description,
        provider
      });

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(kmsKeys.getExternalKmsList(orgId));
    }
  });
};

export const useUpdateExternalKms = (orgId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      kmsId,
      name,
      description,
      provider
    }: {
      kmsId: string;
    } & UpdateExternalKmsType) => {
      const { data } = await apiRequest.patch(`/api/v1/external-kms/${kmsId}`, {
        name,
        description,
        provider
      });

      return data;
    },
    onSuccess: (_, { kmsId }) => {
      queryClient.invalidateQueries(kmsKeys.getExternalKmsList(orgId));
      queryClient.invalidateQueries(kmsKeys.getExternalKmsById(kmsId));
    }
  });
};

export const useRemoveExternalKms = (orgId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (kmsId: string) => {
      const { data } = await apiRequest.delete(`/api/v1/external-kms/${kmsId}`);

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(kmsKeys.getExternalKmsList(orgId));
    }
  });
};

export const useUpdateProjectKms = (projectId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      updatedData: { type: KmsType.Internal } | { type: KmsType.External; kmsId: string }
    ) => {
      const { data } = await apiRequest.patch(`/api/v1/workspace/${projectId}/kms`, {
        kms: updatedData
      });

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(kmsKeys.getActiveProjectKms(projectId));
    }
  });
};

export const useLoadProjectKmsBackup = (projectId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (backup: string) => {
      const { data } = await apiRequest.post(`/api/v1/workspace/${projectId}/kms/backup`, {
        backup
      });

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(kmsKeys.getActiveProjectKms(projectId));
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
        | (Pick<ExternalKmsGcpSchemaType, "credential"> & { kmsId?: never })
        | { kmsId: string; credential?: never }
      )): Promise<{ keys: string[] }> => {
      const { credential, kmsId } = rest;

      if ((credential && kmsId) || (!credential && !kmsId)) {
        throw new Error("Either 'credential' or 'kmsId' must be provided, but not both.");
      }

      const apiUrl = kmsId
        ? `/api/v1/external-kms/fetch-gcp-keys/${kmsId}`
        : "/api/v1/external-kms/fetch-gcp-keys/credential";

      const { data } = await apiRequest.post(apiUrl, {
        region: gcpRegion,
        ...rest
      });

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(kmsKeys.getExternalKmsList(orgId));
    }
  });
};
