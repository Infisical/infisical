import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { appConnectionKeys } from "../queries";
import { TSalesforceOauthApp } from "./types";

const salesforceConnectionKeys = {
  all: [...appConnectionKeys.all, "salesforce"] as const,
  listOauthApps: (connectionId: string) =>
    [...salesforceConnectionKeys.all, "oauth-apps", connectionId] as const
};

export const useSalesforceConnectionListOauthApps = (
  connectionId: string,
  options?: Omit<
    UseQueryOptions<
      TSalesforceOauthApp[],
      unknown,
      TSalesforceOauthApp[],
      ReturnType<typeof salesforceConnectionKeys.listOauthApps>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: salesforceConnectionKeys.listOauthApps(connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ apps: TSalesforceOauthApp[] }>(
        `/api/v1/app-connections/salesforce/${connectionId}/oauth-apps`
      );

      return data.apps;
    },
    ...options
  });
};
