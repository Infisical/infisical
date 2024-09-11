import { useInfiniteQuery, useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { User } from "../types";
import { AdminGetUsersFilters, AdminSlackConfig, TServerConfig } from "./types";

export const adminStandaloneKeys = {
  getUsers: "get-users"
};

export const adminQueryKeys = {
  serverConfig: () => ["server-config"] as const,
  getUsers: (filters: AdminGetUsersFilters) => [adminStandaloneKeys.getUsers, { filters }] as const,
  getAdminSlackConfig: () => ["admin-slack-config"] as const
};

const fetchServerConfig = async () => {
  const { data } = await apiRequest.get<{ config: TServerConfig }>("/api/v1/admin/config");
  return data.config;
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

export const useGetAdminSlackConfig = () =>
  useQuery({
    queryKey: adminQueryKeys.getAdminSlackConfig(),
    queryFn: async () => {
      const { data } = await apiRequest.get<AdminSlackConfig>(
        "/api/v1/admin/integrations/slack/config"
      );

      return data;
    }
  });
