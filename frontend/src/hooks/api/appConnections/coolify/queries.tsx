import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { appConnectionKeys } from "@app/hooks/api/appConnections";

import { TCoolifyResource } from "./types";

const coolifyConnectionKeys = {
  all: [...appConnectionKeys.all, "coolify"] as const,
  listResources: (connectionId: string) =>
    [...coolifyConnectionKeys.all, "resources", connectionId] as const
};

export const useCoolifyConnectionListResources = (
  connectionId: string,
  options?: Omit<
    UseQueryOptions<
      TCoolifyResource[],
      unknown,
      TCoolifyResource[],
      ReturnType<typeof coolifyConnectionKeys.listResources>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: coolifyConnectionKeys.listResources(connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ resources: TCoolifyResource[] }>(
        `/api/v1/app-connections/coolify/${connectionId}/resources`
      );

      return data.resources;
    },
    ...options
  });
};
