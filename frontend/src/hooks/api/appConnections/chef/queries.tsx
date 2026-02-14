import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { appConnectionKeys } from "@app/hooks/api/appConnections";

import { TChefDataBag, TChefDataBagItem } from "./types";

const chefConnectionKeys = {
  all: [...appConnectionKeys.all, "chef"] as const,
  listDataBags: (connectionId: string) =>
    [...chefConnectionKeys.all, "data-bags", connectionId] as const,
  listDataBagItems: (connectionId: string, dataBagName: string) =>
    [...chefConnectionKeys.all, "data-bag-items", connectionId, dataBagName] as const
};

export const useChefConnectionListDataBags = (
  connectionId: string,
  options?: Omit<
    UseQueryOptions<
      TChefDataBag[],
      unknown,
      TChefDataBag[],
      ReturnType<typeof chefConnectionKeys.listDataBags>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: chefConnectionKeys.listDataBags(connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TChefDataBag[]>(
        `/api/v1/app-connections/chef/${connectionId}/data-bags`
      );

      return data;
    },
    ...options
  });
};

export const useChefConnectionListDataBagItems = (
  connectionId: string,
  dataBagName: string,
  options?: Omit<
    UseQueryOptions<
      TChefDataBagItem[],
      unknown,
      TChefDataBagItem[],
      ReturnType<typeof chefConnectionKeys.listDataBagItems>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: chefConnectionKeys.listDataBagItems(connectionId, dataBagName),
    queryFn: async () => {
      const params = { dataBagName };
      const { data } = await apiRequest.get<TChefDataBagItem[]>(
        `/api/v1/app-connections/chef/${connectionId}/data-bag-items`,
        { params }
      );

      return data;
    },
    enabled: Boolean(connectionId && dataBagName),
    ...options
  });
};
