import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { appConnectionKeys } from "@app/hooks/api/appConnections";

import { TRundeckProject } from "./types";

const rundeckConnectionKeys = {
  all: [...appConnectionKeys.all, "rundeck"] as const,
  listProjects: (connectionId: string) =>
    [...rundeckConnectionKeys.all, "projects", connectionId] as const
};

export const useRundeckConnectionListProjects = (
  connectionId: string,
  options?: Omit<
    UseQueryOptions<
      TRundeckProject[],
      unknown,
      TRundeckProject[],
      ReturnType<typeof rundeckConnectionKeys.listProjects>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: rundeckConnectionKeys.listProjects(connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ projects: TRundeckProject[] }>(
        `/api/v1/app-connections/rundeck/${connectionId}/projects`
      );

      return data.projects;
    },
    ...options
  });
};
