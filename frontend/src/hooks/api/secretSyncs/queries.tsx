import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { SecretSync, TSecretSyncOption } from "@app/hooks/api/secretSyncs";
import {
  TListSecretSyncOptions,
  TListSecretSyncs,
  TSecretSync,
  TSecretSyncResponse
} from "@app/hooks/api/secretSyncs/types";

export const secretSyncKeys = {
  all: ["secret-sync"] as const,
  options: () => [...secretSyncKeys.all, "options"] as const,
  list: (projectId: string) => [...secretSyncKeys.all, "list", projectId] as const,
  byId: (destination: SecretSync, syncId: string) =>
    [...secretSyncKeys.all, destination, "by-id", syncId] as const
};

export const useSecretSyncOptions = (
  options?: Omit<
    UseQueryOptions<
      TSecretSyncOption[],
      unknown,
      TSecretSyncOption[],
      ReturnType<typeof secretSyncKeys.options>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: secretSyncKeys.options(),
    queryFn: async () => {
      const { data } = await apiRequest.get<TListSecretSyncOptions>("/api/v1/secret-syncs/options");

      return data.secretSyncOptions;
    },
    ...options
  });
};

export const useSecretSyncOption = (destination: SecretSync) => {
  const { data: syncOptions, isPending } = useSecretSyncOptions();
  const syncOption = syncOptions?.find((option) => option.destination === destination);

  return { syncOption, isPending };
};

export const fetchSecretSyncsByProjectId = async (projectId: string) => {
  const { data } = await apiRequest.get<TListSecretSyncs>("/api/v1/secret-syncs", {
    params: { projectId }
  });

  return data.secretSyncs;
};

export const useListSecretSyncs = (
  projectId: string,
  options?: Omit<
    UseQueryOptions<TSecretSync[], unknown, TSecretSync[], ReturnType<typeof secretSyncKeys.list>>,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: secretSyncKeys.list(projectId),
    queryFn: () => fetchSecretSyncsByProjectId(projectId),
    ...options
  });
};

export const useGetSecretSync = (
  destination: SecretSync,
  syncId: string,
  options?: Omit<
    UseQueryOptions<TSecretSync, unknown, TSecretSync, ReturnType<typeof secretSyncKeys.byId>>,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: secretSyncKeys.byId(destination, syncId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TSecretSyncResponse>(
        `/api/v1/secret-syncs/${destination}/${syncId}`
      );

      return data.secretSync;
    },
    ...options
  });
};
