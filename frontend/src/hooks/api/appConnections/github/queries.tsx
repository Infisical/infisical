import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { appConnectionKeys } from "@app/hooks/api/appConnections";

import {
  TGitHubConnectionEnvironment,
  TGitHubConnectionListEnvironmentsResponse,
  TGitHubConnectionListOrganizationsResponse,
  TGitHubConnectionListRepositoriesResponse,
  TGitHubConnectionOrganization,
  TGitHubConnectionRepository,
  TListGitHubConnectionEnvironments
} from "./types";

const githubConnectionKeys = {
  all: [...appConnectionKeys.all, "github"] as const,
  listRepositories: (connectionId: string) =>
    [...githubConnectionKeys.all, "repositories", connectionId] as const,
  listOrganizations: (connectionId: string) =>
    [...githubConnectionKeys.all, "organizations", connectionId] as const,
  listEnvironments: ({ connectionId, repo, owner }: TListGitHubConnectionEnvironments) =>
    [...githubConnectionKeys.all, "environments", connectionId, repo, owner] as const
};

export const useGitHubConnectionListRepositories = (
  connectionId: string,
  options?: Omit<
    UseQueryOptions<
      TGitHubConnectionRepository[],
      unknown,
      TGitHubConnectionRepository[],
      ReturnType<typeof githubConnectionKeys.listRepositories>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: githubConnectionKeys.listRepositories(connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TGitHubConnectionListRepositoriesResponse>(
        `/api/v1/app-connections/github/${connectionId}/repositories`,
        {}
      );

      return data.repositories;
    },
    ...options
  });
};

export const useGitHubConnectionListOrganizations = (
  connectionId: string,
  options?: Omit<
    UseQueryOptions<
      TGitHubConnectionOrganization[],
      unknown,
      TGitHubConnectionOrganization[],
      ReturnType<typeof githubConnectionKeys.listOrganizations>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: githubConnectionKeys.listOrganizations(connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TGitHubConnectionListOrganizationsResponse>(
        `/api/v1/app-connections/github/${connectionId}/organizations`,
        {}
      );

      return data.organizations;
    },
    ...options
  });
};

export const useGitHubConnectionListEnvironments = (
  { connectionId, repo, owner }: TListGitHubConnectionEnvironments,
  options?: Omit<
    UseQueryOptions<
      TGitHubConnectionEnvironment[],
      unknown,
      TGitHubConnectionEnvironment[],
      ReturnType<typeof githubConnectionKeys.listEnvironments>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: githubConnectionKeys.listEnvironments({ connectionId, repo, owner }),
    queryFn: async () => {
      const { data } = await apiRequest.get<TGitHubConnectionListEnvironmentsResponse>(
        `/api/v1/app-connections/github/${connectionId}/environments`,
        {
          params: {
            repo,
            owner
          }
        }
      );

      return data.environments;
    },
    ...options
  });
};
