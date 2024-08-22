import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { kmsKeys } from "./queries";
import { AddExternalKmsType, KmsType } from "./types";

export const useAddExternalKms = (orgId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ slug, description, provider }: AddExternalKmsType) => {
      const { data } = await apiRequest.post("/api/v1/external-kms", {
        slug,
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
      slug,
      description,
      provider
    }: {
      kmsId: string;
    } & AddExternalKmsType) => {
      const { data } = await apiRequest.patch(`/api/v1/external-kms/${kmsId}`, {
        slug,
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
