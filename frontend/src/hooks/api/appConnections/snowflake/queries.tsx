import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { appConnectionKeys } from "@app/hooks/api/appConnections";

import {
  TListSnowflakeSchemas,
  TSnowflakeDatabase,
  TSnowflakeSchema,
  TSnowflakeUser
} from "./types";

const snowflakeConnectionKeys = {
  all: [...appConnectionKeys.all, "snowflake"] as const,
  listDatabases: (connectionId: string) =>
    [...snowflakeConnectionKeys.all, "databases", connectionId] as const,
  listSchemas: ({ connectionId, database }: TListSnowflakeSchemas) =>
    [...snowflakeConnectionKeys.all, "schemas", connectionId, database] as const,
  listUsers: (connectionId: string) =>
    [...snowflakeConnectionKeys.all, "users", connectionId] as const
};

export const useSnowflakeConnectionListDatabases = (
  connectionId: string,
  options?: Omit<
    UseQueryOptions<
      TSnowflakeDatabase[],
      unknown,
      TSnowflakeDatabase[],
      ReturnType<typeof snowflakeConnectionKeys.listDatabases>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: snowflakeConnectionKeys.listDatabases(connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ databases: TSnowflakeDatabase[] }>(
        `/api/v1/app-connections/snowflake/${connectionId}/databases`
      );

      return data.databases;
    },
    ...options
  });
};

export const useSnowflakeConnectionListSchemas = (
  { connectionId, database }: TListSnowflakeSchemas,
  options?: Omit<
    UseQueryOptions<
      TSnowflakeSchema[],
      unknown,
      TSnowflakeSchema[],
      ReturnType<typeof snowflakeConnectionKeys.listSchemas>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: snowflakeConnectionKeys.listSchemas({ connectionId, database }),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ schemas: TSnowflakeSchema[] }>(
        `/api/v1/app-connections/snowflake/${connectionId}/schemas`,
        { params: { database } }
      );

      return data.schemas;
    },
    ...options
  });
};

export const useSnowflakeConnectionListUsers = (
  connectionId: string,
  options?: Omit<
    UseQueryOptions<
      TSnowflakeUser[],
      unknown,
      TSnowflakeUser[],
      ReturnType<typeof snowflakeConnectionKeys.listUsers>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: snowflakeConnectionKeys.listUsers(connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ users: TSnowflakeUser[] }>(
        `/api/v1/app-connections/snowflake/${connectionId}/users`
      );

      return data.users;
    },
    ...options
  });
};
