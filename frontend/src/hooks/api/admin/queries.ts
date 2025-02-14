import { queryOptions, useInfiniteQuery, useQuery, UseQueryOptions } from "@tanstack/react-query";
import { AxiosError } from "axios";

import { apiRequest } from "@app/config/request";

import { User } from "../types";
import {
  AdminGetUsersFilters,
  AdminSlackConfig,
  TGetServerRootKmsEncryptionDetails,
  TInstanceGatewayConfig,
  TServerConfig
} from "./types";

export const adminStandaloneKeys = {
  getUsers: "get-users"
};

export const adminQueryKeys = {
  serverConfig: () => ["server-config"] as const,
  getUsers: (filters: AdminGetUsersFilters) => [adminStandaloneKeys.getUsers, { filters }] as const,
  getAdminSlackConfig: () => ["admin-slack-config"] as const,
  getServerEncryptionStrategies: () => ["server-encryption-strategies"] as const,

  getInstanceGatewayConfig: () =>
    queryOptions({
      queryKey: ["instance-gateway-config"],
      queryFn: async () => {
        const { data } = await apiRequest
          .get<{ gateway: TInstanceGatewayConfig }>("/api/v1/admin/gateway")
          .catch((err: AxiosError) => {
            if (err.response?.status === 404) return { data: { gateway: false as const } };
            throw err;
          });
        return data.gateway;
      }
    })
};

export const fetchServerConfig = async () => {
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

export const useGetAdminSlackConfig = () => {
  return useQuery({
    queryKey: adminQueryKeys.getAdminSlackConfig(),
    queryFn: async () => {
      const { data } = await apiRequest.get<AdminSlackConfig>(
        "/api/v1/admin/integrations/slack/config"
      );

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
