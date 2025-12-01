import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { PkiSyncStatus } from "@app/hooks/api/pkiSyncs/enums";
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
      const { data } = await apiRequest.post<TPkiSync>(
        `/api/v1/cert-manager/syncs/${destination}`,
        params
      );

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
        `/api/v1/cert-manager/syncs/${destination}/${syncId}`,
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
      const { data } = await apiRequest.delete(
        `/api/v1/cert-manager/syncs/${destination}/${syncId}`,
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

export const useTriggerPkiSyncSyncCertificates = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ syncId, destination }: TTriggerPkiSyncSyncCertificatesDTO) => {
      const { data } = await apiRequest.post(
        `/api/v1/cert-manager/syncs/${destination}/${syncId}/sync`
      );

      return data;
    },
    onMutate: async ({ syncId, projectId }) => {
      await queryClient.cancelQueries({ queryKey: pkiSyncKeys.byId(syncId, projectId) });
      await queryClient.cancelQueries({ queryKey: pkiSyncKeys.list(projectId) });

      const previousPkiSync = queryClient.getQueryData(pkiSyncKeys.byId(syncId, projectId));

      if (previousPkiSync) {
        queryClient.setQueryData(pkiSyncKeys.byId(syncId, projectId), {
          ...previousPkiSync,
          syncStatus: PkiSyncStatus.Pending
        });
      }

      return { previousPkiSync };
    },
    onSuccess: (_, { syncId, projectId }) => {
      const currentData = queryClient.getQueryData(pkiSyncKeys.byId(syncId, projectId));
      if (currentData) {
        queryClient.setQueryData(pkiSyncKeys.byId(syncId, projectId), {
          ...currentData,
          syncStatus: PkiSyncStatus.Pending
        });
      }

      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: pkiSyncKeys.byId(syncId, projectId) });
        queryClient.invalidateQueries({ queryKey: pkiSyncKeys.list(projectId) });
      }, 2000); // Wait 2 seconds before refetching
    },
    onError: (_, { syncId, projectId }, context) => {
      if (context?.previousPkiSync) {
        queryClient.setQueryData(pkiSyncKeys.byId(syncId, projectId), context.previousPkiSync);
      }
    }
  });
};

export const useTriggerPkiSyncImportCertificates = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ syncId, destination }: TTriggerPkiSyncImportCertificatesDTO) => {
      const { data } = await apiRequest.post(
        `/api/v1/cert-manager/syncs/${destination}/${syncId}/import`
      );

      return data;
    },
    onMutate: async ({ syncId, projectId }) => {
      await queryClient.cancelQueries({ queryKey: pkiSyncKeys.byId(syncId, projectId) });
      await queryClient.cancelQueries({ queryKey: pkiSyncKeys.list(projectId) });

      const previousPkiSync = queryClient.getQueryData(pkiSyncKeys.byId(syncId, projectId));

      if (previousPkiSync) {
        queryClient.setQueryData(pkiSyncKeys.byId(syncId, projectId), {
          ...previousPkiSync,
          importStatus: PkiSyncStatus.Pending
        });
      }

      return { previousPkiSync };
    },
    onSuccess: (_, { syncId, projectId }) => {
      const currentData = queryClient.getQueryData(pkiSyncKeys.byId(syncId, projectId));
      if (currentData) {
        queryClient.setQueryData(pkiSyncKeys.byId(syncId, projectId), {
          ...currentData,
          importStatus: PkiSyncStatus.Pending
        });
      }

      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: pkiSyncKeys.byId(syncId, projectId) });
        queryClient.invalidateQueries({ queryKey: pkiSyncKeys.list(projectId) });
      }, 2000); // Wait 2 seconds before refetching
    },
    onError: (_, { syncId, projectId }, context) => {
      if (context?.previousPkiSync) {
        queryClient.setQueryData(pkiSyncKeys.byId(syncId, projectId), context.previousPkiSync);
      }
    }
  });
};

export const useTriggerPkiSyncRemoveCertificates = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ syncId, destination }: TTriggerPkiSyncRemoveCertificatesDTO) => {
      const { data } = await apiRequest.post(
        `/api/v1/cert-manager/syncs/${destination}/${syncId}/remove-certificates`
      );

      return data;
    },
    onMutate: async ({ syncId, projectId }) => {
      await queryClient.cancelQueries({ queryKey: pkiSyncKeys.byId(syncId, projectId) });
      await queryClient.cancelQueries({ queryKey: pkiSyncKeys.list(projectId) });

      const previousPkiSync = queryClient.getQueryData(pkiSyncKeys.byId(syncId, projectId));

      if (previousPkiSync) {
        queryClient.setQueryData(pkiSyncKeys.byId(syncId, projectId), {
          ...previousPkiSync,
          removeStatus: PkiSyncStatus.Pending
        });
      }

      return { previousPkiSync };
    },
    onSuccess: (_, { syncId, projectId }) => {
      const currentData = queryClient.getQueryData(pkiSyncKeys.byId(syncId, projectId));
      if (currentData) {
        queryClient.setQueryData(pkiSyncKeys.byId(syncId, projectId), {
          ...currentData,
          removeStatus: PkiSyncStatus.Pending
        });
      }

      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: pkiSyncKeys.byId(syncId, projectId) });
        queryClient.invalidateQueries({ queryKey: pkiSyncKeys.list(projectId) });
      }, 2000); // Wait 2 seconds before refetching
    },
    onError: (_, { syncId, projectId }, context) => {
      if (context?.previousPkiSync) {
        queryClient.setQueryData(pkiSyncKeys.byId(syncId, projectId), context.previousPkiSync);
      }
    }
  });
};

export const useAddCertificatesToPkiSync = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      pkiSyncId,
      certificateIds
    }: {
      pkiSyncId: string;
      certificateIds: string[];
    }) => {
      const { data } = await apiRequest.post(
        `/api/v1/cert-manager/syncs/${pkiSyncId}/certificates`,
        {
          certificateIds
        }
      );

      return data;
    },
    onSuccess: (_, { pkiSyncId }) => {
      queryClient.invalidateQueries({ queryKey: pkiSyncKeys.certificates(pkiSyncId) });
    }
  });
};

export const useRemoveCertificatesFromPkiSync = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      pkiSyncId,
      certificateIds
    }: {
      pkiSyncId: string;
      certificateIds: string[];
    }) => {
      const { data } = await apiRequest.delete(
        `/api/v1/cert-manager/syncs/${pkiSyncId}/certificates`,
        {
          data: { certificateIds }
        }
      );

      return data;
    },
    onSuccess: (_, { pkiSyncId }) => {
      queryClient.invalidateQueries({ queryKey: pkiSyncKeys.certificates(pkiSyncId) });
    }
  });
};
