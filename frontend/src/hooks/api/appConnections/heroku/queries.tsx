import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { appConnectionKeys } from "../queries";
import { THerokuApp } from "./types";

const herokuConnectionKeys = {
  all: [...appConnectionKeys.all, "heroku"] as const,
  listApps: (connectionId: string) => [...herokuConnectionKeys.all, "apps", connectionId] as const
};

export const useHerokuConnectionListApps = (
  connectionId: string,
  options?: Omit<
    UseQueryOptions<
      THerokuApp[],
      unknown,
      THerokuApp[],
      ReturnType<typeof herokuConnectionKeys.listApps>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: herokuConnectionKeys.listApps(connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<THerokuApp[]>(
        `/api/v1/app-connections/heroku/${connectionId}/apps`
      );

      return data;
    },
    ...options
  });
};
