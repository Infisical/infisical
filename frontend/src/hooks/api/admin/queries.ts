import { useInfiniteQuery, useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { Identity } from "@app/hooks/api/identities/types";

import { User } from "../types";
import {
  AdminGetIdentitiesFilters,
  AdminGetOrganizationsFilters,
  AdminGetUsersFilters,
  AdminIntegrationsConfig,
  OrganizationWithProjects,
  TGetEnvOverrides,
  TGetInvalidatingCacheStatus,
  TGetServerRootKmsEncryptionDetails,
  TServerConfig
} from "./types";

export const adminStandaloneKeys = {
  getUsers: "get-users",
  getOrganizations: "get-organizations",
  getIdentities: "get-identities"
};

export const adminQueryKeys = {
  serverConfig: () => ["server-config"] as const,
  getUsers: (filters: AdminGetUsersFilters) => [adminStandaloneKeys.getUsers, { filters }] as const,
  getOrganizations: (filters: AdminGetOrganizationsFilters) =>
    [adminStandaloneKeys.getOrganizations, { filters }] as const,
  getIdentities: (filters: AdminGetIdentitiesFilters) =>
    [adminStandaloneKeys.getIdentities, { filters }] as const,
  getAdminSlackConfig: () => ["admin-slack-config"] as const,
  getServerEncryptionStrategies: () => ["server-encryption-strategies"] as const,
  getInvalidateCache: () => ["admin-invalidate-cache"] as const,
  getAdminIntegrationsConfig: () => ["admin-integrations-config"] as const,
  getEnvOverrides: () => ["env-overrides"] as const
};

export const fetchServerConfig = async () => {
  const { data } = await apiRequest.get<{ config: TServerConfig }>("/api/v1/admin/config");
  return data.config;
};

export const useAdminGetOrganizations = (filters: AdminGetOrganizationsFilters) => {
  return useInfiniteQuery({
    initialPageParam: 0,
    queryKey: adminQueryKeys.getOrganizations(filters),
    queryFn: async ({ pageParam }) => {
      const { data } = await apiRequest.get<{ organizations: OrganizationWithProjects[] }>(
        "/api/v1/admin/organization-management/organizations",
        {
          params: {
            ...filters,
            offset: pageParam
          }
        }
      );

      return data.organizations;
    },
    getNextPageParam: (lastPage, pages) =>
      lastPage.length !== 0 ? pages.length * filters.limit : undefined
  });
};

export const useGetServerConfig = ({
  options = {}
}: {
  options?: Omit<
    UseQueryOptions<
      TServerConfig,
      unknown,
      TServerConfig,
      ReturnType<typeof adminQueryKeys.serverConfig>
    >,
    "queryKey" | "queryFn"
  >;
} = {}) =>
  useQuery({
    queryKey: adminQueryKeys.serverConfig(),
    queryFn: fetchServerConfig,
    ...options,
    enabled: options?.enabled ?? true
  });

export const useAdminGetUsers = (filters: AdminGetUsersFilters) => {
  return useInfiniteQuery({
    initialPageParam: 0,
    queryKey: adminQueryKeys.getUsers(filters),
    queryFn: async ({ pageParam }) => {
      const { data } = await apiRequest.get<{ users: User[] }>(
        "/api/v1/admin/user-management/users",
        {
          params: {
            ...filters,
            offset: pageParam
          }
        }
      );

      return data.users;
    },
    getNextPageParam: (lastPage, pages) =>
      lastPage.length !== 0 ? pages.length * filters.limit : undefined
  });
};

export const useAdminGetIdentities = (filters: AdminGetIdentitiesFilters) => {
  return useInfiniteQuery({
    initialPageParam: 0,
    queryKey: adminQueryKeys.getIdentities(filters),
    queryFn: async ({ pageParam }) => {
      const { data } = await apiRequest.get<{ identities: Identity[] }>(
        "/api/v1/admin/identity-management/identities",
        {
          params: {
            ...filters,
            offset: pageParam
          }
        }
      );

      return data.identities;
    },
    getNextPageParam: (lastPage, pages) =>
      lastPage.length !== 0 ? pages.length * filters.limit : undefined
  });
};

export const useGetAdminIntegrationsConfig = () => {
  return useQuery({
    queryKey: adminQueryKeys.getAdminIntegrationsConfig(),
    queryFn: async () => {
      const { data } = await apiRequest.get<AdminIntegrationsConfig>("/api/v1/admin/integrations");

      return data;
    }
  });
};

export const useGetServerRootKmsEncryptionDetails = () => {
  return useQuery({
    queryKey: adminQueryKeys.getServerEncryptionStrategies(),
    queryFn: async () => {
      const { data } = await apiRequest.get<TGetServerRootKmsEncryptionDetails>(
        "/api/v1/admin/encryption-strategies"
      );

      return data;
    }
  });
};

export const useGetInvalidatingCacheStatus = (enabled = true) => {
  return useQuery({
    queryKey: adminQueryKeys.getInvalidateCache(),
    queryFn: async () => {
      const { data } = await apiRequest.get<TGetInvalidatingCacheStatus>(
        "/api/v1/admin/invalidating-cache-status"
      );

      return data.invalidating;
    },
    enabled,
    refetchInterval: (data) => (data ? 3000 : false)
  });
};

export const useGetEnvOverrides = () => {
  return useQuery({
    queryKey: adminQueryKeys.getEnvOverrides(),
    queryFn: async () => {
      const { data } = await apiRequest.get<TGetEnvOverrides>("/api/v1/admin/env-overrides");
      return data;
    }
  });
};
