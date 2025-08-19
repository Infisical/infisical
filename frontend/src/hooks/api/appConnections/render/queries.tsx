import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { appConnectionKeys } from "../queries";
import { TRenderEnvironmentGroup, TRenderService } from "./types";

const renderConnectionKeys = {
  all: [...appConnectionKeys.all, "render"] as const,
  listServices: (connectionId: string) =>
    [...renderConnectionKeys.all, "services", connectionId] as const,
  listEnvironmentGroups: (connectionId: string) =>
    [...renderConnectionKeys.all, "environment-groups", connectionId] as const
};

export const useRenderConnectionListServices = (
  connectionId: string,
  options?: Omit<
    UseQueryOptions<
      TRenderService[],
      unknown,
      TRenderService[],
      ReturnType<typeof renderConnectionKeys.listServices>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: renderConnectionKeys.listServices(connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TRenderService[]>(
        `/api/v1/app-connections/render/${connectionId}/services`
      );

      return data;
    },
    ...options
  });
};

export const useRenderConnectionListEnvironmentGroups = (
  connectionId: string,
  options?: Omit<
    UseQueryOptions<
      TRenderEnvironmentGroup[],
      unknown,
      TRenderEnvironmentGroup[],
      ReturnType<typeof renderConnectionKeys.listEnvironmentGroups>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: renderConnectionKeys.listEnvironmentGroups(connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TRenderEnvironmentGroup[]>(
        `/api/v1/app-connections/render/${connectionId}/environment-groups`
      );

      return data;
    },
    ...options
  });
};
