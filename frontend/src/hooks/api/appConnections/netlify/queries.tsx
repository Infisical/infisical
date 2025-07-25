import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { appConnectionKeys } from "@app/hooks/api/appConnections";

import { TNetlifyAccount, TNetlifySite } from "./types";

const netlifyConnectionKeys = {
  all: [...appConnectionKeys.all, "netlify"] as const,
  listAccounts: (connectionId: string) =>
    [...netlifyConnectionKeys.all, "accounts", connectionId] as const,
  listSites: (connectionId: string, accountId: string) =>
    [...netlifyConnectionKeys.all, "sites", connectionId, accountId] as const
};

export const useNetlifyConnectionListAccounts = (
  connectionId: string,
  options?: Omit<
    UseQueryOptions<
      TNetlifyAccount[],
      unknown,
      TNetlifyAccount[],
      ReturnType<typeof netlifyConnectionKeys.listAccounts>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: netlifyConnectionKeys.listAccounts(connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ accounts: TNetlifyAccount[] }>(
        `/api/v1/app-connections/netlify/${connectionId}/accounts`
      );

      return data.accounts;
    },
    ...options
  });
};

export const useNetlifyConnectionListSites = (
  connectionId: string,
  accountId: string,
  options?: Omit<
    UseQueryOptions<
      TNetlifySite[],
      unknown,
      TNetlifySite[],
      ReturnType<typeof netlifyConnectionKeys.listSites>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: netlifyConnectionKeys.listSites(connectionId, accountId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ sites: TNetlifySite[] }>(
        `/api/v1/app-connections/netlify/${connectionId}/accounts/${accountId}/sites`
      );

      return data.sites;
    },
    ...options
  });
};
