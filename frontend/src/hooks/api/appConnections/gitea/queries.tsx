import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { appConnectionKeys } from "../queries";
import { TGiteaConnectionListRepositoriesResponse, TGiteaRepo } from "./types";

const giteaConnectionKeys = {
  all: [...appConnectionKeys.all, "gitea"] as const,
  listRepos: (connectionId: string) => [...giteaConnectionKeys.all, "repos", connectionId] as const
};

export const useGiteaConnectionListRepositories = (
  connectionId: string,
  options?: Omit<
    UseQueryOptions<
      TGiteaRepo[],
      unknown,
      TGiteaRepo[],
      ReturnType<typeof giteaConnectionKeys.listRepos>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: giteaConnectionKeys.listRepos(connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TGiteaConnectionListRepositoriesResponse>(
        `/api/v1/app-connections/gitea/${connectionId}/repositories`
      );
      return data;
    },
    ...options
  });
};
