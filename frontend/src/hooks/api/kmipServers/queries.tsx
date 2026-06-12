import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TKmipServer, TKmipServerWithAuthMethod } from "./types";

export const kmipServerQueryKeys = {
  list: () => ["kmip-servers"] as const,
  byId: (kmipServerId: string) => [{ kmipServerId }, "kmip-server"] as const
};

const fetchKmipServers = async (): Promise<TKmipServer[]> => {
  const { data } = await apiRequest.get<TKmipServer[]>("/api/v1/kmip/servers");
  return data;
};

const fetchKmipServerById = async (kmipServerId: string): Promise<TKmipServerWithAuthMethod> => {
  const { data } = await apiRequest.get<TKmipServerWithAuthMethod>(
    `/api/v1/kmip/servers/${kmipServerId}`
  );
  return data;
};

export const useGetKmipServers = () => {
  return useQuery({
    queryKey: kmipServerQueryKeys.list(),
    queryFn: fetchKmipServers
  });
};

export const useGetKmipServerById = (kmipServerId: string) => {
  return useQuery({
    queryKey: kmipServerQueryKeys.byId(kmipServerId),
    queryFn: () => fetchKmipServerById(kmipServerId),
    enabled: Boolean(kmipServerId),
    staleTime: 0,
    gcTime: 0
  });
};
