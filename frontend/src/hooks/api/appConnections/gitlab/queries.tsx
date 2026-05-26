import { keepPreviousData, useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { appConnectionKeys } from "../queries";
import {
  TGitLabGroup,
  TGitLabGroupTreeItem,
  TGitLabListProjectsParams,
  TGitLabProject
} from "./types";

const gitlabConnectionKeys = {
  all: [...appConnectionKeys.all, "gitlab"] as const,
  listProjects: (connectionId: string, params?: TGitLabListProjectsParams) =>
    [...gitlabConnectionKeys.all, "projects", connectionId, params ?? {}] as const,
  listGroups: (connectionId: string) =>
    [...gitlabConnectionKeys.all, "groups", connectionId] as const,
  listRootGroups: (connectionId: string) =>
    [...gitlabConnectionKeys.all, "root-groups", connectionId] as const,
  searchGroups: (connectionId: string, search: string) =>
    [...gitlabConnectionKeys.all, "search-groups", connectionId, search] as const,
  searchGroupsAndProjects: (connectionId: string, search: string) =>
    [...gitlabConnectionKeys.all, "search-groups-and-projects", connectionId, search] as const,
  listSubgroups: (connectionId: string, groupId: string) =>
    [...gitlabConnectionKeys.all, "subgroups", connectionId, groupId] as const,
  listGroupProjects: (connectionId: string, groupId: string) =>
    [...gitlabConnectionKeys.all, "group-projects", connectionId, groupId] as const
};

const buildProjectsQueryParams = (params?: TGitLabListProjectsParams) => {
  const search = new URLSearchParams();
  if (params?.owned !== undefined) search.set("owned", String(params.owned));
  if (params?.search) search.set("search", params.search);
  if (params?.page !== undefined) search.set("page", String(params.page));
  if (params?.perPage !== undefined) search.set("perPage", String(params.perPage));
  const qs = search.toString();
  return qs ? `?${qs}` : "";
};

export const useGitLabConnectionListProjects = (
  connectionId: string,
  params?: TGitLabListProjectsParams,
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
    queryKey: gitlabConnectionKeys.listProjects(connectionId, params),
    queryFn: async () => {
      const { data } = await apiRequest.get<TGitLabProject[]>(
        `/api/v1/app-connections/gitlab/${connectionId}/projects${buildProjectsQueryParams(params)}`
      );

      return data;
    },
    placeholderData: keepPreviousData,
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

export const useGitLabConnectionSearchGroups = (
  connectionId: string,
  search: string,
  options?: Omit<
    UseQueryOptions<
      TGitLabGroupTreeItem[],
      unknown,
      TGitLabGroupTreeItem[],
      ReturnType<typeof gitlabConnectionKeys.searchGroups>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: gitlabConnectionKeys.searchGroups(connectionId, search),
    queryFn: async () => {
      const { data } = await apiRequest.get<TGitLabGroupTreeItem[]>(
        `/api/v1/app-connections/gitlab/${connectionId}/search-groups?search=${encodeURIComponent(search)}`
      );

      return data;
    },
    ...options
  });
};

export const useGitLabConnectionSearchGroupsAndProjects = (
  connectionId: string,
  search: string,
  options?: Omit<
    UseQueryOptions<
      TGitLabGroupTreeItem[],
      unknown,
      TGitLabGroupTreeItem[],
      ReturnType<typeof gitlabConnectionKeys.searchGroupsAndProjects>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: gitlabConnectionKeys.searchGroupsAndProjects(connectionId, search),
    queryFn: async () => {
      const { data } = await apiRequest.get<TGitLabGroupTreeItem[]>(
        `/api/v1/app-connections/gitlab/${connectionId}/search-groups-and-projects?search=${encodeURIComponent(search)}`
      );

      return data;
    },
    ...options
  });
};

export const useGitLabConnectionListSubgroups = (
  connectionId: string,
  groupId: string,
  options?: Omit<
    UseQueryOptions<
      TGitLabGroupTreeItem[],
      unknown,
      TGitLabGroupTreeItem[],
      ReturnType<typeof gitlabConnectionKeys.listSubgroups>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: gitlabConnectionKeys.listSubgroups(connectionId, groupId),
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
