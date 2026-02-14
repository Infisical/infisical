import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { appConnectionKeys } from "@app/hooks/api/appConnections";

import {
  TGitHubRadarConnectionListRepositoriesResponse,
  TGitHubRadarConnectionRepository
} from "./types";

const githubRadarConnectionKeys = {
  all: [...appConnectionKeys.all, "github-radar"] as const,
  listRepositories: (connectionId: string) =>
    [...githubRadarConnectionKeys.all, "repositories", connectionId] as const
};

export const useGitHubRadarConnectionListRepositories = (
  connectionId: string,
  options?: Omit<
    UseQueryOptions<
      TGitHubRadarConnectionRepository[],
      unknown,
      TGitHubRadarConnectionRepository[],
      ReturnType<typeof githubRadarConnectionKeys.listRepositories>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: githubRadarConnectionKeys.listRepositories(connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TGitHubRadarConnectionListRepositoriesResponse>(
        `/api/v1/app-connections/github-radar/${connectionId}/repositories`,
        {}
      );

      return data.repositories;
    },
    ...options
  });
};
