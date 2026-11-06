import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { appConnectionKeys } from "../queries";
import { TOpenRouterWorkspace } from "./types";

const openRouterConnectionKeys = {
  all: [...appConnectionKeys.all, "open-router"] as const,
  listWorkspaces: (connectionId: string) =>
    [...openRouterConnectionKeys.all, "workspaces", connectionId] as const
};

export const useListOpenRouterConnectionWorkspaces = (
  connectionId: string,
  options?: Omit<
    UseQueryOptions<
      TOpenRouterWorkspace[],
      unknown,
      TOpenRouterWorkspace[],
      ReturnType<typeof openRouterConnectionKeys.listWorkspaces>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: openRouterConnectionKeys.listWorkspaces(connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ workspaces: TOpenRouterWorkspace[] }>(
        `/api/v1/app-connections/open-router/${connectionId}/workspaces`
      );

      return data.workspaces;
    },
    ...options
  });
};
