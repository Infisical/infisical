import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { appConnectionKeys } from "../queries";
import { TFlyioApp } from "./types";

const flyioConnectionKeys = {
  all: [...appConnectionKeys.all, "flyio"] as const,
  listApps: (connectionId: string) => [...flyioConnectionKeys.all, "apps", connectionId] as const
};

export const useFlyioConnectionListApps = (
  connectionId: string,
  options?: Omit<
    UseQueryOptions<
      TFlyioApp[],
      unknown,
      TFlyioApp[],
      ReturnType<typeof flyioConnectionKeys.listApps>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: flyioConnectionKeys.listApps(connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TFlyioApp[]>(
        `/api/v1/app-connections/flyio/${connectionId}/apps`
      );

      return data;
    },
    ...options
  });
};
