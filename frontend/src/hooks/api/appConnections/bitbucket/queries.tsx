import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { appConnectionKeys } from "../queries";
import {
  TBitbucketConnectionListRepositoriesResponse,
  TBitbucketConnectionListWorkspacesResponse,
  TBitbucketRepo,
  TBitbucketWorkspace
} from "./types";

const bitbucketConnectionKeys = {
  all: [...appConnectionKeys.all, "bitbucket"] as const,
  listRepos: (connectionId: string, workspaceSlug: string) =>
    [...bitbucketConnectionKeys.all, "repos", connectionId, workspaceSlug] as const,
  listWorkspaces: (connectionId: string) =>
    [...bitbucketConnectionKeys.all, "workspaces", connectionId] as const
};

export const useBitbucketConnectionListWorkspaces = (
  connectionId: string,
  options?: Omit<
    UseQueryOptions<
      TBitbucketWorkspace[],
      unknown,
      TBitbucketWorkspace[],
      ReturnType<typeof bitbucketConnectionKeys.listWorkspaces>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: bitbucketConnectionKeys.listWorkspaces(connectionId),
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
      ReturnType<typeof bitbucketConnectionKeys.listRepos>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: bitbucketConnectionKeys.listRepos(connectionId, workspaceSlug),
    queryFn: async () => {
      const { data } = await apiRequest.get<TBitbucketConnectionListRepositoriesResponse>(
        `/api/v1/app-connections/bitbucket/${connectionId}/repositories?workspaceSlug=${encodeURIComponent(workspaceSlug)}`
      );

      return data.repositories;
    },
    ...options
  });
};
