import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { appConnectionKeys } from "../queries";
import { TGitLabGroup, TGitLabGroupTreeItem, TGitLabProject } from "./types";

const gitlabConnectionKeys = {
  all: [...appConnectionKeys.all, "gitlab"] as const,
  listProjects: (connectionId: string) =>
    [...gitlabConnectionKeys.all, "projects", connectionId] as const,
  listGroups: (connectionId: string) =>
    [...gitlabConnectionKeys.all, "groups", connectionId] as const,
  listRootGroups: (connectionId: string) =>
    [...gitlabConnectionKeys.all, "root-groups", connectionId] as const,
  listGroupSubgroups: (connectionId: string, groupId: string) =>
    [...gitlabConnectionKeys.all, "subgroups", connectionId, groupId] as const,
  listGroupProjects: (connectionId: string, groupId: string) =>
    [...gitlabConnectionKeys.all, "group-projects", connectionId, groupId] as const
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
        `/api/v1/app-connections/gitlab/${connectionId}/projects`
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
        `/api/v1/app-connections/gitlab/${connectionId}/groups`
      );

      return data;
    },
    ...options
  });
};

export const useGitLabConnectionListRootGroups = (
  connectionId: string,
  options?: Omit<
    UseQueryOptions<
      TGitLabGroupTreeItem[],
      unknown,
      TGitLabGroupTreeItem[],
      ReturnType<typeof gitlabConnectionKeys.listRootGroups>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: gitlabConnectionKeys.listRootGroups(connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TGitLabGroupTreeItem[]>(
        `/api/v1/app-connections/gitlab/${connectionId}/root-groups`
      );
      return data;
    },
    ...options
  });
};

export const useGitLabConnectionListGroupSubgroups = (
  connectionId: string,
  groupId: string,
  options?: Omit<
    UseQueryOptions<
      TGitLabGroupTreeItem[],
      unknown,
      TGitLabGroupTreeItem[],
      ReturnType<typeof gitlabConnectionKeys.listGroupSubgroups>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: gitlabConnectionKeys.listGroupSubgroups(connectionId, groupId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TGitLabGroupTreeItem[]>(
        `/api/v1/app-connections/gitlab/${connectionId}/groups/${groupId}/subgroups`
      );
      return data;
    },
    ...options
  });
};

export const useGitLabConnectionListGroupProjects = (
  connectionId: string,
  groupId: string,
  options?: Omit<
    UseQueryOptions<
      TGitLabProject[],
      unknown,
      TGitLabProject[],
      ReturnType<typeof gitlabConnectionKeys.listGroupProjects>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: gitlabConnectionKeys.listGroupProjects(connectionId, groupId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TGitLabProject[]>(
        `/api/v1/app-connections/gitlab/${connectionId}/groups/${groupId}/projects`
      );
      return data;
    },
    ...options
  });
};
