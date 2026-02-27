import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { OrderByDirection } from "../generic/types";
import { KmipClientOrderBy, TListProjectKmipClientsDTO, TProjectKmipClientList } from "./types";

export const kmipKeys = {
  getKmipClientsByProjectId: ({ projectId, ...filters }: TListProjectKmipClientsDTO) =>
    [projectId, filters] as const
};

export const useGetKmipClientsByProjectId = (
  {
    projectId,
    offset = 0,
    limit = 100,
    orderBy = KmipClientOrderBy.Name,
    orderDirection = OrderByDirection.ASC,
    search = ""
  }: TListProjectKmipClientsDTO,
  options?: Omit<
    UseQueryOptions<
      TProjectKmipClientList,
      unknown,
      TProjectKmipClientList,
      ReturnType<typeof kmipKeys.getKmipClientsByProjectId>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: kmipKeys.getKmipClientsByProjectId({
      projectId,
      offset,
      limit,
      orderBy,
      orderDirection,
      search
    }),
    queryFn: async () => {
      const { data } = await apiRequest.get<TProjectKmipClientList>("/api/v1/kmip/clients", {
        params: { projectId, offset, limit, search, orderBy, orderDirection }
      });

      return data;
    },
    enabled: Boolean(projectId) && (options?.enabled ?? true),
    placeholderData: (previousData) => previousData,
    ...options
  });
};
