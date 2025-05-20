import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { appConnectionKeys } from "@app/hooks/api/appConnections";

import { TGitLabConnectionListProjectsResponse, TGitLabConnectionProject } from "./types";

const gitlabConnectionKeys = {
  all: [...appConnectionKeys.all, "gitlab"] as const,
  listProjects: (connectionId: string) =>
    [...gitlabConnectionKeys.all, "projects", connectionId] as const
};

export const useGitLabConnectListProjects = (
  connectionId: string,
  options?: Omit<
    UseQueryOptions<
      TGitLabConnectionProject[],
      unknown,
      TGitLabConnectionProject[],
      ReturnType<typeof gitlabConnectionKeys.listProjects>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: gitlabConnectionKeys.listProjects(connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TGitLabConnectionListProjectsResponse>(
        `/api/v1/app-connections/gitlab/${connectionId}/projects`
      );

      return data.projects;
    },
    ...options
  });
};
