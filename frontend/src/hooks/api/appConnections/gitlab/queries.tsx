import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { appConnectionKeys } from "../queries";
import { TGitLabGroup, TGitLabProject, TGitLabServiceAccount } from "./types";

const gitlabConnectionKeys = {
  all: [...appConnectionKeys.all, "gitlab"] as const,
  listProjects: (connectionId: string, search?: string, limit?: number) =>
    [...gitlabConnectionKeys.all, "projects", connectionId, search ?? "", limit ?? ""] as const,
  listGroups: (connectionId: string, search?: string, limit?: number) =>
    [...gitlabConnectionKeys.all, "groups", connectionId, search ?? "", limit ?? ""] as const,
  listGroupServiceAccounts: (connectionId: string, groupId: string) =>
    [...gitlabConnectionKeys.all, "group-service-accounts", connectionId, groupId] as const
};

export const useGitLabConnectionListProjects = (
  connectionId: string,
  search?: string,
  limit?: number,
  options?: Omit<
    UseQueryOptions<
      TGitLabProject[],
      unknown,
      TGitLabProject[],
      ReturnType<typeof gitlabConnectionKeys.listProjects>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: gitlabConnectionKeys.listProjects(connectionId, search, limit),
    queryFn: async ({ signal }) => {
      const { data } = await apiRequest.get<TGitLabProject[]>(
        `/api/v1/app-connections/gitlab/${connectionId}/projects`,
        {
          signal,
          params: {
            ...(search ? { search } : {}),
            ...(limit !== undefined ? { limit } : {})
          }
        }
      );

      return data;
    },
    retry: false,
    ...options
  });
};

export const useGitLabConnectionListGroups = (
  connectionId: string,
  search?: string,
  limit?: number,
  options?: Omit<
    UseQueryOptions<
      TGitLabGroup[],
      unknown,
      TGitLabGroup[],
      ReturnType<typeof gitlabConnectionKeys.listGroups>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: gitlabConnectionKeys.listGroups(connectionId, search, limit),
    queryFn: async ({ signal }) => {
      const { data } = await apiRequest.get<TGitLabGroup[]>(
        `/api/v1/app-connections/gitlab/${connectionId}/groups`,
        {
          signal,
          params: {
            ...(search ? { search } : {}),
            ...(limit !== undefined ? { limit } : {})
          }
        }
      );

      return data;
    },
    retry: false,
    ...options
  });
};

export const useGitLabConnectionListGroupServiceAccounts = (
  connectionId: string,
  groupId: string,
  options?: Omit<
    UseQueryOptions<
      TGitLabServiceAccount[],
      unknown,
      TGitLabServiceAccount[],
      ReturnType<typeof gitlabConnectionKeys.listGroupServiceAccounts>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: gitlabConnectionKeys.listGroupServiceAccounts(connectionId, groupId),
    queryFn: async ({ signal }) => {
      const { data } = await apiRequest.get<TGitLabServiceAccount[]>(
        `/api/v1/app-connections/gitlab/${connectionId}/groups/${groupId}/service-accounts`,
        { signal }
      );

      return data;
    },
    retry: false,
    ...options
  });
};
