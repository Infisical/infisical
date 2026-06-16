import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { appConnectionKeys } from "../queries";
import {
  TBitbucketConnectionListEnvironmentsResponse,
  TBitbucketConnectionListRepositoriesResponse,
  TBitbucketConnectionListWorkspacesResponse,
  TBitbucketEnvironment,
  TBitbucketRepo,
  TBitbucketWorkspace
} from "./types";

const bitbucketConnectionKeys = {
  all: [...appConnectionKeys.all, "bitbucket"] as const,
  listRepos: (connectionId: string, workspaceSlug: string, search?: string) =>
    [...bitbucketConnectionKeys.all, "repos", connectionId, workspaceSlug, { search }] as const,
  listWorkspaces: (connectionId: string, search?: string) =>
    [...bitbucketConnectionKeys.all, "workspaces", connectionId, { search }] as const,
  listEnvironments: (connectionId: string, workspaceSlug: string, repoSlug: string) =>
    [...bitbucketConnectionKeys.all, "environments", connectionId, workspaceSlug, repoSlug] as const
};

export const useBitbucketConnectionListWorkspaces = (
  connectionId: string,
  search?: string,
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
    queryKey: bitbucketConnectionKeys.listWorkspaces(connectionId, search),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) {
        params.set("search", search);
      }
      const query = params.toString();
      const { data } = await apiRequest.get<TBitbucketConnectionListWorkspacesResponse>(
        `/api/v1/app-connections/bitbucket/${connectionId}/workspaces${query ? `?${query}` : ""}`
      );

      return data.workspaces;
    },
    ...options
  });
};

export const useBitbucketConnectionListRepositories = (
  connectionId: string,
  workspaceSlug: string,
  search?: string,
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
    queryKey: bitbucketConnectionKeys.listRepos(connectionId, workspaceSlug, search),
    queryFn: async () => {
      const params = new URLSearchParams({ workspaceSlug });
      if (search) {
        params.set("search", search);
      }
      const { data } = await apiRequest.get<TBitbucketConnectionListRepositoriesResponse>(
        `/api/v1/app-connections/bitbucket/${connectionId}/repositories?${params.toString()}`
      );

      return data.repositories;
    },
    ...options
  });
};

export const useBitbucketConnectionListEnvironments = (
  connectionId: string,
  workspaceSlug: string,
  repoSlug: string,
  options?: Omit<
    UseQueryOptions<
      TBitbucketEnvironment[],
      unknown,
      TBitbucketEnvironment[],
      ReturnType<typeof bitbucketConnectionKeys.listEnvironments>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: bitbucketConnectionKeys.listEnvironments(connectionId, workspaceSlug, repoSlug),
    queryFn: async () => {
      const { data } = await apiRequest.get<TBitbucketConnectionListEnvironmentsResponse>(
        `/api/v1/app-connections/bitbucket/${connectionId}/environments?workspaceSlug=${encodeURIComponent(workspaceSlug)}&repositorySlug=${encodeURIComponent(repoSlug)}`
      );

      return data.environments;
    },
    ...options
  });
};
