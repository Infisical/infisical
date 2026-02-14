import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { appConnectionKeys } from "../queries";
import { TGitLabGroup, TGitLabProject } from "./types";

const gitlabConnectionKeys = {
  all: [...appConnectionKeys.all, "gitlab"] as const,
  listProjects: (connectionId: string) =>
    [...gitlabConnectionKeys.all, "projects", connectionId] as const,
  listGroups: (connectionId: string) =>
    [...gitlabConnectionKeys.all, "groups", connectionId] as const
};

export const useGitLabConnectionListProjects = (
  connectionId: string,
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
    queryKey: gitlabConnectionKeys.listProjects(connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TGitLabProject[]>(
        `/api/v1/app-connections/gitlab/${connectionId}/projects`,
        {}
      );

      return data;
    },
    ...options
  });
};

export const useGitLabConnectionListGroups = (
  connectionId: string,
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
    queryKey: gitlabConnectionKeys.listGroups(connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TGitLabGroup[]>(
        `/api/v1/app-connections/gitlab/${connectionId}/groups`,
        {}
      );

      return data;
    },
    ...options
  });
};
