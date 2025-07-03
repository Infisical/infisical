import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { appConnectionKeys } from "../queries";
import {
  TBitbucketConnectionListRepositoriesResponse,
  TBitbucketConnectionListWorkspacesResponse,
  TBitbucketRepo,
  TBitbucketWorkspace
} from "./types";

const bitBucketConnectionKeys = {
  all: [...appConnectionKeys.all, "bitbucket"] as const,
  listRepos: (connectionId: string, workspaceSlug: string) =>
    [...bitBucketConnectionKeys.all, "repos", connectionId, workspaceSlug] as const,
  listWorkspaces: (connectionId: string) =>
    [...bitBucketConnectionKeys.all, "workspaces", connectionId] as const
};

export const useBitbucketConnectionListWorkspaces = (
  connectionId: string,
  options?: Omit<
    UseQueryOptions<
      TBitbucketWorkspace[],
      unknown,
      TBitbucketWorkspace[],
      ReturnType<typeof bitBucketConnectionKeys.listWorkspaces>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: bitBucketConnectionKeys.listWorkspaces(connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TBitbucketConnectionListWorkspacesResponse>(
        `/api/v1/app-connections/bitbucket/${connectionId}/workspaces`
      );

      return data.workspaces;
    },
    ...options
  });
};

export const useBitbucketConnectionListRepositories = (
  connectionId: string,
  workspaceSlug: string,
  options?: Omit<
    UseQueryOptions<
      TBitbucketRepo[],
      unknown,
      TBitbucketRepo[],
      // The ReturnType here will be a supertype of the actual queryKey, which is acceptable
      ReturnType<typeof bitBucketConnectionKeys.listRepos>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    // Append workspaceSlug to the existing query key for unique caching
    queryKey: bitBucketConnectionKeys.listRepos(connectionId, workspaceSlug),
    queryFn: async () => {
      const { data } = await apiRequest.get<TBitbucketConnectionListRepositoriesResponse>(
        // Include workspaceSlug in the API endpoint path
        `/api/v1/app-connections/bitbucket/${connectionId}/repositories?workspaceSlug=${workspaceSlug}`
      );

      return data.repositories;
    },
    ...options
  });
};
