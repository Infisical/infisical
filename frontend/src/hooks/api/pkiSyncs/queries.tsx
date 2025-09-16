import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { PkiSync, TPkiSyncOption } from "@app/hooks/api/pkiSyncs";
import {
  TListPkiSyncOptions,
  TListPkiSyncs,
  TPkiSync,
  TPkiSyncResponse
} from "@app/hooks/api/pkiSyncs/types";

export const pkiSyncKeys = {
  all: ["pki-sync"] as const,
  options: () => [...pkiSyncKeys.all, "options"] as const,
  list: (projectId: string) => [...pkiSyncKeys.all, "list", projectId] as const,
  byId: (syncId: string, projectId: string) =>
    [...pkiSyncKeys.all, "by-id", syncId, projectId] as const
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
      const { data } = await apiRequest.get<TListPkiSyncOptions>("/api/v1/pki-syncs/options");

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

export const fetchPkiSyncsByProjectId = async (projectId: string) => {
  const { data } = await apiRequest.get<TListPkiSyncs>("/api/v1/pki-syncs", {
    params: { projectId }
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
      const { data } = await apiRequest.get<TPkiSyncResponse>(`/api/v1/pki-syncs/${syncId}`, {
        params: { projectId }
      });

      return data.pkiSync;
    },
    ...options
  });
};
