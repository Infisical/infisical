import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { PkiSync, TPkiSyncOption } from "@app/hooks/api/pkiSyncs";
import {
  TListPkiSyncOptions,
  TListPkiSyncs,
  TPkiSync,
  TPkiSyncCertificate
} from "@app/hooks/api/pkiSyncs/types";

export const pkiSyncKeys = {
  all: ["pki-sync"] as const,
  options: () => [...pkiSyncKeys.all, "options"] as const,
  list: (projectId: string) => [...pkiSyncKeys.all, "list", projectId] as const,
  listWithCertificate: (projectId: string, certificateId: string) =>
    [...pkiSyncKeys.all, "list", projectId, "with-certificate", certificateId] as const,
  byId: (syncId: string, projectId: string) =>
    [...pkiSyncKeys.all, "by-id", syncId, projectId] as const,
  certificates: (syncId: string, pagination?: { offset: number; limit: number }) =>
    pagination
      ? ([...pkiSyncKeys.all, "certificates", syncId, pagination] as const)
      : ([...pkiSyncKeys.all, "certificates", syncId] as const)
};

export const usePkiSyncOptions = (
  options?: Omit<
    UseQueryOptions<
      TPkiSyncOption[],
      unknown,
      TPkiSyncOption[],
      ReturnType<typeof pkiSyncKeys.options>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: pkiSyncKeys.options(),
    queryFn: async () => {
      const { data } = await apiRequest.get<TListPkiSyncOptions>("/api/v1/pki/syncs/options");

      return data.pkiSyncOptions;
    },
    ...options
  });
};

export const usePkiSyncOption = (destination: PkiSync) => {
  const { data: syncOptions, isPending } = usePkiSyncOptions();
  const syncOption = syncOptions?.find((option) => option.destination === destination);

  return { syncOption, isPending };
};

export const fetchPkiSyncsByProjectId = async (projectId: string, certificateId?: string) => {
  const params: { projectId: string; certificateId?: string } = { projectId };
  if (certificateId) {
    params.certificateId = certificateId;
  }

  const { data } = await apiRequest.get<TListPkiSyncs>("/api/v1/pki/syncs", {
    params
  });

  return data.pkiSyncs;
};

export const useListPkiSyncs = (
  projectId: string,
  options?: Omit<
    UseQueryOptions<TPkiSync[], unknown, TPkiSync[], ReturnType<typeof pkiSyncKeys.list>>,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: pkiSyncKeys.list(projectId),
    queryFn: () => fetchPkiSyncsByProjectId(projectId),
    ...options
  });
};

export const useListPkiSyncsWithCertificate = (
  projectId: string,
  certificateId: string,
  options?: Omit<
    UseQueryOptions<
      TPkiSync[],
      unknown,
      TPkiSync[],
      ReturnType<typeof pkiSyncKeys.listWithCertificate>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: pkiSyncKeys.listWithCertificate(projectId, certificateId),
    queryFn: () => fetchPkiSyncsByProjectId(projectId, certificateId),
    enabled: !!projectId && !!certificateId,
    ...options
  });
};

export const useGetPkiSync = (
  { syncId, projectId }: { syncId: string; projectId: string },
  options?: Omit<
    UseQueryOptions<TPkiSync, unknown, TPkiSync, ReturnType<typeof pkiSyncKeys.byId>>,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: pkiSyncKeys.byId(syncId, projectId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TPkiSync>(`/api/v1/pki/syncs/${syncId}`, {
        params: { projectId }
      });

      return data;
    },
    ...options
  });
};

export const useListPkiSyncCertificates = (
  syncId: string,
  pagination?: { offset?: number; limit?: number },
  options?: Omit<
    UseQueryOptions<
      { certificates: TPkiSyncCertificate[]; totalCount: number },
      unknown,
      { certificates: TPkiSyncCertificate[]; totalCount: number },
      ReturnType<typeof pkiSyncKeys.certificates>
    >,
    "queryKey" | "queryFn"
  >
) => {
  const { offset = 0, limit = 20 } = pagination || {};

  return useQuery({
    queryKey: pkiSyncKeys.certificates(syncId, { offset, limit }),
    queryFn: async () => {
      const { data } = await apiRequest.get(`/api/v1/pki/syncs/${syncId}/certificates`, {
        params: { offset, limit }
      });
      return {
        certificates: data.certificates || [],
        totalCount: data.totalCount || 0
      };
    },
    ...options
  });
};
