import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import {
  AdminGetIdentitiesFilters,
  AdminGetOrganizationsFilters,
  AdminGetUsersFilters,
  AdminIntegrationsConfig,
  TGetEnvOverrides,
  TGetIdentitiesResponse,
  TGetInvalidatingCacheStatus,
  TGetOrganizationsResponse,
  TGetServerRootKmsEncryptionDetails,
  TGetUsersResponse,
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
  getOrganizations: (filters?: AdminGetOrganizationsFilters) =>
    [adminStandaloneKeys.getOrganizations, ...(filters ? [{ filters }] : [])] as const,
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
  return useQuery({
    queryKey: adminQueryKeys.getOrganizations(filters),
    queryFn: async () => {
      const { data } = await apiRequest.get<TGetOrganizationsResponse>(
        "/api/v1/admin/organization-management/organizations",
        {
          params: {
            ...filters
          }
        }
      );

      return { organizations: data.organizations, totalCount: data.total };
    },
    placeholderData: (previousData) => previousData
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
  return useQuery({
    queryKey: adminQueryKeys.getUsers(filters),
    queryFn: async () => {
      const { data } = await apiRequest.get<TGetUsersResponse>(
        "/api/v1/admin/user-management/users",
        {
          params: {
            ...filters
          }
        }
      );

      return { users: data.users, totalCount: data.total };
    },
    placeholderData: (previousData) => previousData
  });
};

export const useAdminGetIdentities = (filters: AdminGetIdentitiesFilters) => {
  return useQuery({
    queryKey: adminQueryKeys.getIdentities(filters),
    queryFn: async () => {
      const { data } = await apiRequest.get<TGetIdentitiesResponse>(
        "/api/v1/admin/identity-management/identities",
        {
          params: {
            ...filters
          }
        }
      );

      return { identities: data.identities, totalCount: data.total };
    },
    placeholderData: (previousData) => previousData
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
