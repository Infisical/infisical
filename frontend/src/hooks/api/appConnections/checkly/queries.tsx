import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { appConnectionKeys } from "@app/hooks/api/appConnections";

import { TChecklyAccount } from "./types";

const checklyConnectionKeys = {
  all: [...appConnectionKeys.all, "checkly"] as const,
  listAccounts: (connectionId: string) =>
    [...checklyConnectionKeys.all, "workspace-scopes", connectionId] as const,
  listGroups: (connectionId: string, accountId: string) =>
    [...checklyConnectionKeys.all, "groups", connectionId, accountId] as const
};

export const useChecklyConnectionListAccounts = (
  connectionId: string,
  options?: Omit<
    UseQueryOptions<
      TChecklyAccount[],
      unknown,
      TChecklyAccount[],
      ReturnType<typeof checklyConnectionKeys.listAccounts>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: checklyConnectionKeys.listAccounts(connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ accounts: TChecklyAccount[] }>(
        `/api/v1/app-connections/checkly/${connectionId}/accounts`
      );

      return data.accounts;
    },
    ...options
  });
};

export const useChecklyConnectionListGroups = (
  connectionId: string,
  accountId: string,
  options?: Omit<
    UseQueryOptions<
      TChecklyAccount[],
      unknown,
      TChecklyAccount[],
      ReturnType<typeof checklyConnectionKeys.listGroups>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: checklyConnectionKeys.listGroups(connectionId, accountId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ groups: TChecklyAccount[] }>(
        `/api/v1/app-connections/checkly/${connectionId}/accounts/${accountId}/groups`
      );

      return data.groups;
    },
    ...options
  });
};
