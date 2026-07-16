import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { appConnectionKeys } from "@app/hooks/api/appConnections";

import { THasuraCloudProject } from "./types";

const hasuraCloudConnectionKeys = {
  all: [...appConnectionKeys.all, "hasura-cloud"] as const,
  listProjects: (connectionId: string) =>
    [...hasuraCloudConnectionKeys.all, "projects", connectionId] as const
};

export const useHasuraCloudConnectionListProjects = (
  connectionId: string,
  options?: Omit<
    UseQueryOptions<
      THasuraCloudProject[],
      unknown,
      THasuraCloudProject[],
      ReturnType<typeof hasuraCloudConnectionKeys.listProjects>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: hasuraCloudConnectionKeys.listProjects(connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ projects: THasuraCloudProject[] }>(
        `/api/v1/app-connections/hasura-cloud/${connectionId}/projects`
      );

      return data.projects;
    },
    ...options
  });
};
