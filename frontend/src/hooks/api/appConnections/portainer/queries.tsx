import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { appConnectionKeys } from "@app/hooks/api/appConnections";

import { TPortainerEnvironment, TPortainerStack } from "./types";

const portainerConnectionKeys = {
  all: [...appConnectionKeys.all, "portainer"] as const,
  listEnvironments: (connectionId: string) =>
    [...portainerConnectionKeys.all, "environments", connectionId] as const,
  listStacks: (connectionId: string) =>
    [...portainerConnectionKeys.all, "stacks", connectionId] as const
};

export const usePortainerConnectionListEnvironments = (
  connectionId: string,
  options?: Omit<
    UseQueryOptions<
      TPortainerEnvironment[],
      unknown,
      TPortainerEnvironment[],
      ReturnType<typeof portainerConnectionKeys.listEnvironments>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: portainerConnectionKeys.listEnvironments(connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ environments: TPortainerEnvironment[] }>(
        `/api/v1/app-connections/portainer/${connectionId}/environments`
      );

      return data.environments;
    },
    ...options
  });
};

export const usePortainerConnectionListStacks = (
  connectionId: string,
  options?: Omit<
    UseQueryOptions<
      TPortainerStack[],
      unknown,
      TPortainerStack[],
      ReturnType<typeof portainerConnectionKeys.listStacks>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: portainerConnectionKeys.listStacks(connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ stacks: TPortainerStack[] }>(
        `/api/v1/app-connections/portainer/${connectionId}/stacks`
      );

      return data.stacks;
    },
    ...options
  });
};
