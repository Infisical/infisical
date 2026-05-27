import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { appConnectionKeys } from "../queries";
import { TGitLabGroup, TGitLabProject } from "./types";

const gitlabConnectionKeys = {
  all: [...appConnectionKeys.all, "gitlab"] as const,
  listProjects: (connectionId: string, search?: string) =>
    [...gitlabConnectionKeys.all, "projects", connectionId, search ?? ""] as const,
  listGroups: (connectionId: string, search?: string) =>
    [...gitlabConnectionKeys.all, "groups", connectionId, search ?? ""] as const
};

export const useGitLabConnectionListProjects = (
  connectionId: string,
  search?: string,
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
    queryKey: gitlabConnectionKeys.listProjects(connectionId, search),
    queryFn: async () => {
      const { data } = await apiRequest.get<TGitLabProject[]>(
        `/api/v1/app-connections/gitlab/${connectionId}/projects`,
        { params: search ? { search } : undefined }
      );

      return data;
    },
    ...options
  });
};

export const useGitLabConnectionListGroups = (
  connectionId: string,
  search?: string,
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
    queryKey: gitlabConnectionKeys.listGroups(connectionId, search),
    queryFn: async () => {
      const { data } = await apiRequest.get<TGitLabGroup[]>(
        `/api/v1/app-connections/gitlab/${connectionId}/groups`,
        { params: search ? { search } : undefined }
      );

      return data;
    },
    ...options
  });
};
