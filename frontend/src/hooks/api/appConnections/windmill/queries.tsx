import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { appConnectionKeys } from "../queries";
import { TWindmillWorkspace } from "./types";

const windmillConnectionKeys = {
  all: [...appConnectionKeys.all, "windmill"] as const,
  listWorkspaces: (connectionId: string) =>
    [...windmillConnectionKeys.all, "workspaces", connectionId] as const
};

export const useWindmillConnectionListWorkspaces = (
  connectionId: string,
  options?: Omit<
    UseQueryOptions<
      TWindmillWorkspace[],
      unknown,
      TWindmillWorkspace[],
      ReturnType<typeof windmillConnectionKeys.listWorkspaces>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: windmillConnectionKeys.listWorkspaces(connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TWindmillWorkspace[]>(
        `/api/v1/app-connections/windmill/${connectionId}/workspaces`
      );

      return data;
    },
    ...options
  });
};
