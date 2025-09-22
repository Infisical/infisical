import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { pkiSyncKeys } from "@app/hooks/api/pkiSyncs/queries";
import {
  TCreatePkiSyncDTO,
  TDeletePkiSyncDTO,
  TPkiSync,
  TTriggerPkiSyncImportCertificatesDTO,
  TTriggerPkiSyncRemoveCertificatesDTO,
  TTriggerPkiSyncSyncCertificatesDTO,
  TUpdatePkiSyncDTO
} from "@app/hooks/api/pkiSyncs/types";

export const useCreatePkiSync = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ destination, ...params }: TCreatePkiSyncDTO) => {
      const { data } = await apiRequest.post<TPkiSync>(`/api/v1/pki/syncs/${destination}`, params);

      return data;
    },
    onSuccess: (_, { projectId }) =>
      queryClient.invalidateQueries({ queryKey: pkiSyncKeys.list(projectId) })
  });
};

export const useUpdatePkiSync = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ syncId, projectId, destination, ...params }: TUpdatePkiSyncDTO) => {
      const { data } = await apiRequest.patch<TPkiSync>(
        `/api/v1/pki/syncs/${destination}/${syncId}`,
        params,
        { params: { projectId } }
      );

      return data;
    },
    onSuccess: (_, { syncId, projectId }) => {
      queryClient.invalidateQueries({ queryKey: pkiSyncKeys.list(projectId) });
      queryClient.invalidateQueries({ queryKey: pkiSyncKeys.byId(syncId, projectId) });
    }
  });
};

export const useDeletePkiSync = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ syncId, projectId, destination }: TDeletePkiSyncDTO) => {
      const { data } = await apiRequest.delete(`/api/v1/pki/syncs/${destination}/${syncId}`, {
        params: { projectId }
      });

      return data;
    },
    onSuccess: (_, { syncId, projectId }) => {
      queryClient.invalidateQueries({ queryKey: pkiSyncKeys.list(projectId) });
      queryClient.invalidateQueries({ queryKey: pkiSyncKeys.byId(syncId, projectId) });
    }
  });
};

export const useTriggerPkiSyncSyncCertificates = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ syncId, destination }: TTriggerPkiSyncSyncCertificatesDTO) => {
      const { data } = await apiRequest.post(`/api/v1/pki/syncs/${destination}/${syncId}/sync`);

      return data;
    },
    onSuccess: (_, { syncId }) => {
      // Invalidate all PKI sync queries since we don't have projectId here
      queryClient.invalidateQueries({ queryKey: pkiSyncKeys.all });
      queryClient.invalidateQueries({ queryKey: ["pkiSync", syncId] });
    }
  });
};

export const useTriggerPkiSyncImportCertificates = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ syncId, destination }: TTriggerPkiSyncImportCertificatesDTO) => {
      const { data } = await apiRequest.post(`/api/v1/pki/syncs/${destination}/${syncId}/import`);

      return data;
    },
    onSuccess: (_, { syncId }) => {
      // Invalidate all PKI sync queries since we don't have projectId here
      queryClient.invalidateQueries({ queryKey: pkiSyncKeys.all });
      queryClient.invalidateQueries({ queryKey: ["pkiSync", syncId] });
    }
  });
};

export const useTriggerPkiSyncRemoveCertificates = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ syncId, destination }: TTriggerPkiSyncRemoveCertificatesDTO) => {
      const { data } = await apiRequest.post(
        `/api/v1/pki/syncs/${destination}/${syncId}/remove-certificates`
      );

      return data;
    },
    onSuccess: (_, { syncId }) => {
      // Invalidate all PKI sync queries since we don't have projectId here
      queryClient.invalidateQueries({ queryKey: pkiSyncKeys.all });
      queryClient.invalidateQueries({ queryKey: ["pkiSync", syncId] });
    }
  });
};
