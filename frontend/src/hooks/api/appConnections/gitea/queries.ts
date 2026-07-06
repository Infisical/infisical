import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { appConnectionKeys } from "../queries";
import {
  TGiteaListOrganizationsResponse,
  TGiteaListRepositoriesResponse,
  TGiteaOrganization,
  TGiteaRepository
} from "./types";

const giteaConnectionKeys = {
  all: [...appConnectionKeys.all, "gitea"] as const,
  listOrganizations: (connectionId: string) =>
    [...giteaConnectionKeys.all, "organizations", connectionId] as const,
  listRepositories: (connectionId: string, search?: string, limit?: number) =>
    [...giteaConnectionKeys.all, "repositories", connectionId, search ?? "", limit ?? ""] as const
};

export const useGiteaConnectionListOrganizations = (
  connectionId: string,
  options?: Omit<
    UseQueryOptions<TGiteaOrganization[], unknown, TGiteaOrganization[]>,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: giteaConnectionKeys.listOrganizations(connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TGiteaListOrganizationsResponse>(
        `/api/v1/app-connections/gitea/${connectionId}/organizations`
      );

      return data.organizations;
    },
    ...options
  });
};

export const useGiteaConnectionListRepositories = (
  connectionId: string,
  search?: string,
  limit?: number,
  options?: Omit<
    UseQueryOptions<TGiteaRepository[], unknown, TGiteaRepository[]>,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: giteaConnectionKeys.listRepositories(connectionId, search, limit),
    queryFn: async () => {
      const { data } = await apiRequest.get<TGiteaListRepositoriesResponse>(
        `/api/v1/app-connections/gitea/${connectionId}/repositories`,
        {
          params: {
            ...(search ? { search } : {}),
            ...(limit !== undefined ? { limit } : {})
          }
        }
      );

      return data.repositories;
    },
    ...options
  });
};
