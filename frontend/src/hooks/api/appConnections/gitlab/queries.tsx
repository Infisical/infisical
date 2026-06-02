import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { appConnectionKeys } from "../queries";
import { TGitLabGroup, TGitLabProject } from "./types";

const gitlabConnectionKeys = {
  all: [...appConnectionKeys.all, "gitlab"] as const,
  listProjects: (connectionId: string, search?: string, limit?: number) =>
    [...gitlabConnectionKeys.all, "projects", connectionId, search ?? "", limit ?? ""] as const,
  listGroups: (connectionId: string, search?: string, limit?: number) =>
    [...gitlabConnectionKeys.all, "groups", connectionId, search ?? "", limit ?? ""] as const
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
    queryFn: async () => {
      const { data } = await apiRequest.get<TGitLabProject[]>(
        `/api/v1/app-connections/gitlab/${connectionId}/projects`,
        {
          params: {
            ...(search ? { search } : {}),
            ...(limit !== undefined ? { limit } : {})
          }
        }
      );

      return data;
    },
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
    queryFn: async () => {
      const { data } = await apiRequest.get<TGitLabGroup[]>(
        `/api/v1/app-connections/gitlab/${connectionId}/groups`,
        {
          params: {
            ...(search ? { search } : {}),
            ...(limit !== undefined ? { limit } : {})
          }
        }
      );

      return data;
    },
    ...options
  });
};
