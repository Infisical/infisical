import { useMemo } from "react";
import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import {
  TAppConnection,
  TAppConnectionMap,
  TAppConnectionOptions,
  TGetAppConnection,
  TListAppConnections
} from "@app/hooks/api/appConnections/types";
import {
  TAppConnectionOption,
  TAppConnectionOptionMap
} from "@app/hooks/api/appConnections/types/app-options";

export const appConnectionKeys = {
  all: ["app-connection"] as const,
  options: () => [...appConnectionKeys.all, "options"] as const,
  list: () => [...appConnectionKeys.all, "list"] as const,
  listByApp: (app: AppConnection) => [...appConnectionKeys.list(), app],
  byId: (app: AppConnection, templateId: string) =>
    [...appConnectionKeys.all, app, "by-id", templateId] as const
};

export const useAppConnectionOptions = (
  options?: Omit<
    UseQueryOptions<
      TAppConnectionOption[],
      unknown,
      TAppConnectionOption[],
      ReturnType<typeof appConnectionKeys.options>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: appConnectionKeys.options(),
    queryFn: async () => {
      const { data } = await apiRequest.get<TAppConnectionOptions>(
        "/api/v1/app-connections/options"
      );

      return data.appConnectionOptions;
    },
    ...options
  });
};

export const useGetAppConnectionOption = <T extends AppConnection>(app: T) => {
  const { data: options = [], isLoading } = useAppConnectionOptions();

  return useMemo(
    () => ({
      option: (options.find((opt) => opt.app === app) as TAppConnectionOptionMap[T]) ?? {},
      isLoading
    }),
    [options, app]
  );
};

export const useListAppConnections = (
  options?: Omit<
    UseQueryOptions<
      TAppConnection[],
      unknown,
      TAppConnection[],
      ReturnType<typeof appConnectionKeys.list>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: appConnectionKeys.list(),
    queryFn: async () => {
      const { data } = await apiRequest.get<TListAppConnections<TAppConnection>>(
        "/api/v1/app-connections"
      );

      return data.appConnections;
    },
    ...options
  });
};

export const useListAppConnectionsByApp = <T extends AppConnection>(
  app: T,
  options?: Omit<
    UseQueryOptions<
      TAppConnectionMap[T][],
      unknown,
      TAppConnectionMap[T][],
      ReturnType<typeof appConnectionKeys.listByApp>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: appConnectionKeys.listByApp(app),
    queryFn: async () => {
      const { data } = await apiRequest.get<TListAppConnections<TAppConnectionMap[T]>>(
        `/api/v1/app-connections/${app}`
      );

      return data.appConnections;
    },
    ...options
  });
};

export const useGetAppConnectionById = <T extends AppConnection>(
  app: T,
  connectionId: string,
  options?: Omit<
    UseQueryOptions<
      TAppConnectionMap[T],
      unknown,
      TAppConnectionMap[T],
      ReturnType<typeof appConnectionKeys.byId>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: appConnectionKeys.byId(app, connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TGetAppConnection<TAppConnectionMap[T]>>(
        `/api/v1/app-connections/${app}/${connectionId}`
      );

      return data.appConnection;
    },
    ...options
  });
};
