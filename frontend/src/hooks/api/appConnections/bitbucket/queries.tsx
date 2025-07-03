import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { appConnectionKeys } from "../queries";
import { TBitBucketConnectionListRepositoriesResponse, TBitBucketRepo } from "./types";

const bitBucketConnectionKeys = {
  all: [...appConnectionKeys.all, "bitbucket"] as const,
  listRepos: (connectionId: string) =>
    [...bitBucketConnectionKeys.all, "repos", connectionId] as const
};

export const useBitBucketConnectionListRepositories = (
  connectionId: string,
  options?: Omit<
    UseQueryOptions<
      TBitBucketRepo[],
      unknown,
      TBitBucketRepo[],
      ReturnType<typeof bitBucketConnectionKeys.listRepos>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: bitBucketConnectionKeys.listRepos(connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TBitBucketConnectionListRepositoriesResponse>(
        `/api/v1/app-connections/bitbucket/${connectionId}/repositories`
      );

      return data.repositories;
    },
    ...options
  });
};
