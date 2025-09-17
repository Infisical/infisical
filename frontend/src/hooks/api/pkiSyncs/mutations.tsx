import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { pkiSyncKeys } from "@app/hooks/api/pkiSyncs/queries";
import {
  TCreatePkiSyncDTO,
  TDeletePkiSyncDTO,
  TPkiSyncResponse,
  TTriggerPkiSyncImportCertificatesDTO,
  TTriggerPkiSyncRemoveCertificatesDTO,
  TTriggerPkiSyncSyncCertificatesDTO,
  TUpdatePkiSyncDTO
} from "@app/hooks/api/pkiSyncs/types";

export const useCreatePkiSync = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ destination, ...params }: TCreatePkiSyncDTO) => {
      const { data } = await apiRequest.post<TPkiSyncResponse>(
        `/api/v1/pki-syncs/${destination}`,
        params
      );

      return data.pkiSync;
    },
    onSuccess: (_, { projectId }) =>
      queryClient.invalidateQueries({ queryKey: pkiSyncKeys.list(projectId) })
  });
};

export const useUpdatePkiSync = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ syncId, projectId, destination, ...params }: TUpdatePkiSyncDTO) => {
      const { data } = await apiRequest.patch<TPkiSyncResponse>(
        `/api/v1/pki-syncs/${destination}/${syncId}`,
        params,
        { params: { projectId } }
      );

      return data.pkiSync;
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
      const { data } = await apiRequest.delete(`/api/v1/pki-syncs/${destination}/${syncId}`, {
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
    mutationFn: async ({ syncId, projectId, destination }: TTriggerPkiSyncSyncCertificatesDTO) => {
      const { data } = await apiRequest.post(
        `/api/v1/pki-syncs/${destination}/${syncId}/sync`,
        {},
        {
          params: { projectId }
        }
      );

      return data;
    },
    onSuccess: (_, { syncId, projectId }) => {
      queryClient.invalidateQueries({ queryKey: pkiSyncKeys.list(projectId) });
      queryClient.invalidateQueries({ queryKey: pkiSyncKeys.byId(syncId, projectId) });
    }
  });
};

export const useTriggerPkiSyncImportCertificates = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      syncId,
      projectId,
      destination
    }: TTriggerPkiSyncImportCertificatesDTO) => {
      const { data } = await apiRequest.post(
        `/api/v1/pki-syncs/${destination}/${syncId}/import`,
        {},
        {
          params: { projectId }
        }
      );

      return data;
    },
    onSuccess: (_, { syncId, projectId }) => {
      queryClient.invalidateQueries({ queryKey: pkiSyncKeys.list(projectId) });
      queryClient.invalidateQueries({ queryKey: pkiSyncKeys.byId(syncId, projectId) });
    }
  });
};

export const useTriggerPkiSyncRemoveCertificates = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      syncId,
      projectId,
      destination
    }: TTriggerPkiSyncRemoveCertificatesDTO) => {
      const { data } = await apiRequest.post(
        `/api/v1/pki-syncs/${destination}/${syncId}/remove`,
        {},
        {
          params: { projectId }
        }
      );

      return data;
    },
    onSuccess: (_, { syncId, projectId }) => {
      queryClient.invalidateQueries({ queryKey: pkiSyncKeys.list(projectId) });
      queryClient.invalidateQueries({ queryKey: pkiSyncKeys.byId(syncId, projectId) });
    }
  });
};
