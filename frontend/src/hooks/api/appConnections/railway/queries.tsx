import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { appConnectionKeys } from "@app/hooks/api/appConnections";

import { TRailwayProject } from "./types";

const railwayConnectionKeys = {
  all: [...appConnectionKeys.all, "railway"] as const,
  listSecretScopes: (connectionId: string) =>
    [...railwayConnectionKeys.all, "workspace-scopes", connectionId] as const
};

export const useRailwayConnectionListProjects = (
  connectionId: string,
  options?: Omit<
    UseQueryOptions<
      TRailwayProject[],
      unknown,
      TRailwayProject[],
      ReturnType<typeof railwayConnectionKeys.listSecretScopes>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: railwayConnectionKeys.listSecretScopes(connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ projects: TRailwayProject[] }>(
        `/api/v1/app-connections/railway/${connectionId}/projects`
      );

      return data.projects;
    },
    ...options
  });
};
