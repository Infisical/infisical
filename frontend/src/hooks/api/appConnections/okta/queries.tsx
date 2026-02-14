import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { appConnectionKeys } from "../queries";
import { TOktaApp } from "./types";

const oktaConnectionKeys = {
  all: [...appConnectionKeys.all, "okta"] as const,
  listApps: (connectionId: string) => [...oktaConnectionKeys.all, "apps", connectionId] as const
};

export const useOktaConnectionListApps = (
  connectionId: string,
  options?: Omit<
    UseQueryOptions<
      TOktaApp[],
      unknown,
      TOktaApp[],
      ReturnType<typeof oktaConnectionKeys.listApps>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: oktaConnectionKeys.listApps(connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ apps: TOktaApp[] }>(
        `/api/v1/app-connections/okta/${connectionId}/apps`,
        {}
      );

      return data.apps;
    },
    ...options
  });
};
