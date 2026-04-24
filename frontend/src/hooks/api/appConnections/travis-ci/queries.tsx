import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { appConnectionKeys } from "../queries";
import { TTravisCIBranch, TTravisCIRepository } from "./types";

const travisCIConnectionKeys = {
  all: [...appConnectionKeys.all, "travis-ci"] as const,
  listRepositories: (connectionId: string) =>
    [...travisCIConnectionKeys.all, "repositories", connectionId] as const,
  listBranches: (connectionId: string, repositoryId: string) =>
    [...travisCIConnectionKeys.all, "branches", connectionId, repositoryId] as const
};

export const useTravisCIConnectionListRepositories = (
  connectionId: string,
  options?: Omit<
    UseQueryOptions<
      TTravisCIRepository[],
      unknown,
      TTravisCIRepository[],
      ReturnType<typeof travisCIConnectionKeys.listRepositories>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: travisCIConnectionKeys.listRepositories(connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TTravisCIRepository[]>(
        `/api/v1/app-connections/travis-ci/${connectionId}/repositories`
      );

      return data;
    },
    ...options
  });
};

export const useTravisCIConnectionListBranches = (
  connectionId: string,
  repositoryId: string,
  options?: Omit<
    UseQueryOptions<
      TTravisCIBranch[],
      unknown,
      TTravisCIBranch[],
      ReturnType<typeof travisCIConnectionKeys.listBranches>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: travisCIConnectionKeys.listBranches(connectionId, repositoryId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TTravisCIBranch[]>(
        `/api/v1/app-connections/travis-ci/${connectionId}/branches`,
        {
          params: { repositoryId }
        }
      );

      return data;
    },
    ...options
  });
};
