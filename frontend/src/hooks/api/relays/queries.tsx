import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TRelay } from "./types";

export const relayQueryKeys = {
  list: () => ["relays"] as const
};

const fetchRelays = async (): Promise<TRelay[]> => {
  const { data } = await apiRequest.get<TRelay[]>("/api/v1/relays");
  return data;
};

export const useGetRelays = () => {
  return useQuery({
    queryKey: relayQueryKeys.list(),
    queryFn: fetchRelays
  });
};
