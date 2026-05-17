import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { appConnectionKeys } from "../queries";
import { TDatadogServiceAccount } from "./types";

const datadogConnectionKeys = {
  all: [...appConnectionKeys.all, "datadog"] as const,
  listServiceAccounts: (connectionId: string) =>
    [...datadogConnectionKeys.all, "service-accounts", connectionId] as const
};

export const useListDatadogConnectionServiceAccounts = (
  connectionId: string,
  options?: Omit<
    UseQueryOptions<
      TDatadogServiceAccount[],
      unknown,
      TDatadogServiceAccount[],
      ReturnType<typeof datadogConnectionKeys.listServiceAccounts>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: datadogConnectionKeys.listServiceAccounts(connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ serviceAccounts: TDatadogServiceAccount[] }>(
        `/api/v1/app-connections/datadog/${connectionId}/service-accounts`
      );

      return data.serviceAccounts;
    },
    ...options
  });
};
