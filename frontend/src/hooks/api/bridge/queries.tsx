import { queryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TBridge } from "./types";

export const bridgeQueryKeys = {
  allKey: () => ["bridges"],
  listKey: (projectId: string) => [...bridgeQueryKeys.allKey(), "list", projectId],
  byIdKey: (id: string) => [...bridgeQueryKeys.allKey(), "by-id", id],
  list: (projectId: string) =>
    queryOptions({
      queryKey: bridgeQueryKeys.listKey(projectId),
      queryFn: async () => {
        const { data } = await apiRequest.get<{ bridges: TBridge[] }>("/api/v1/bridge", {
          params: { projectId }
        });
        return data.bridges;
      }
    }),
  byId: (id: string) =>
    queryOptions({
      queryKey: bridgeQueryKeys.byIdKey(id),
      queryFn: async () => {
        const { data } = await apiRequest.get<{ bridge: TBridge }>(`/api/v1/bridge/${id}`);
        return data.bridge;
      }
    })
};

