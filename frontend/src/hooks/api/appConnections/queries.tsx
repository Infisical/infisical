import { useMemo } from "react";
import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import {
  TAppConnection,
  TAppConnectionOptions,
  TAvailableAppConnection,
  TAvailableAppConnectionsResponse,
  TListAppConnections
} from "@app/hooks/api/appConnections/types";
import {
  TAppConnectionOption,
  TAppConnectionOptionMap
} from "@app/hooks/api/appConnections/types/app-options";
import { ProjectType } from "@app/hooks/api/projects/types";

export const appConnectionKeys = {
  all: ["app-connection"] as const,
  options: (projectType?: ProjectType) =>
    [...appConnectionKeys.all, "options", ...(projectType ? [projectType] : [])] as const,
  list: (projectId?: string | null) =>
    [...appConnectionKeys.all, "list", ...(projectId ? [projectId] : [])] as const,
  listAvailable: (app: AppConnection, projectId?: string | null) =>
    [...appConnectionKeys.all, app, "list-available", ...(projectId ? [projectId] : [])] as const
  // scott: may need these in the future but not using now
  // getUsage: (app: AppConnection, connectionId: string) =>
  //   [...appConnectionKeys.all, "usage", app, connectionId] as const
  // listByApp: (app: AppConnection) => [...appConnectionKeys.list(), app],
  // scott: we will need this once we have individual app connection page
  // byId: (app: AppConnection, connectionId: string) =>
  //   [...appConnectionKeys.all, app, "by-id", connectionId] as const
};

export const useAppConnectionOptions = (
  projectType?: ProjectType,
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
    queryKey: appConnectionKeys.options(projectType),
    queryFn: async () => {
      const { data } = await apiRequest.get<TAppConnectionOptions>(
        "/api/v1/app-connections/options",
        { params: { projectType } }
      );

      return data.appConnectionOptions;
    },
    ...options
  });
};

export const useGetAppConnectionOption = <T extends AppConnection>(app: T) => {
  const { data: options = [], isPending } = useAppConnectionOptions();

  return useMemo(() => {
    const foundOption = options.find((opt) => opt.app === app);
    return {
      option: (foundOption as TAppConnectionOptionMap[T]) ?? {},
      isLoading: isPending
    };
  }, [options, app, isPending]);
};

export const useListAppConnections = (
  projectId?: string,
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
    queryKey: appConnectionKeys.list(projectId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TListAppConnections<TAppConnection>>(
        "/api/v1/app-connections",
        { params: { projectId } }
      );

      return data.appConnections;
    },
    ...options
  });
};

export const useListAvailableAppConnections = (
  app: AppConnection,
  projectId: string,
  options?: Omit<
    UseQueryOptions<
      TAvailableAppConnection[],
      unknown,
      TAvailableAppConnection[],
      ReturnType<typeof appConnectionKeys.listAvailable>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: appConnectionKeys.listAvailable(app, projectId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TAvailableAppConnectionsResponse>(
        `/api/v1/app-connections/${app}/available`,
        { params: { projectId } }
      );

      return data.appConnections;
    },
    ...options
  });
};

// scott: may need these in the future but not using now
// export const useGetAppConnectionUsageById = (
//   app: AppConnection,
//   connectionId: string,
//   options?: Omit<
//     UseQueryOptions<
//       AppConnectionUsage,
//       unknown,
//       AppConnectionUsage,
//       ReturnType<typeof appConnectionKeys.getUsage>
//     >,
//     "queryKey" | "queryFn"
//   >
// ) => {
//   return useQuery({
//     queryKey: appConnectionKeys.getUsage(app, connectionId),
//     queryFn: async () => {
//       const { data } = await apiRequest.get<AppConnectionUsage>(
//         `/api/v1/app-connections/${app}/${connectionId}/usage`
//       );
//
//       return data;
//     },
//     ...options
//   });
// };

// scott: may need these in the future but not using now
// export const useListAppConnectionsByApp = <T extends AppConnection>(
//   app: T,
//   options?: Omit<
//     UseQueryOptions<
//       TAppConnectionMap[T][],
//       unknown,
//       TAppConnectionMap[T][],
//       ReturnType<typeof appConnectionKeys.listByApp>
//     >,
//     "queryKey" | "queryFn"
//   >
// ) => {
//   return useQuery({
//     queryKey: appConnectionKeys.listByApp(app),
//     queryFn: async () => {
//       const { data } = await apiRequest.get<TListAppConnections<TAppConnectionMap[T]>>(
//         `/api/v1/app-connections/${app}`
//       );
//
//       return data.appConnections;
//     },
//     ...options
//   });
// };

// scott: we will need this once we have individual app connection page
// export const useGetAppConnectionById = <T extends AppConnection>(
//   app: T,
//   connectionId: string,
//   options?: Omit<
//     UseQueryOptions<
//       TAppConnectionMap[T],
//       unknown,
//       TAppConnectionMap[T],
//       ReturnType<typeof appConnectionKeys.byId>
//     >,
//     "queryKey" | "queryFn"
//   >
// ) => {
//   return useQuery({
//     queryKey: appConnectionKeys.byId(app, connectionId),
//     queryFn: async () => {
//       const { data } = await apiRequest.get<TGetAppConnection<TAppConnectionMap[T]>>(
//         `/api/v1/app-connections/${app}/${connectionId}`
//       );
//
//       return data.appConnection;
//     },
//     ...options
//   });
// };
