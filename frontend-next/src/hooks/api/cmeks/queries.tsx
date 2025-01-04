import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { CmekOrderBy, TListProjectCmeksDTO, TProjectCmeksList } from "@app/hooks/api/cmeks/types";
import { OrderByDirection } from "@app/hooks/api/generic/types";

export const cmekKeys = {
  all: ["cmek"] as const,
  lists: () => [...cmekKeys.all, "list"] as const,
  getCmeksByProjectId: ({ projectId, ...filters }: TListProjectCmeksDTO) =>
    [...cmekKeys.lists(), projectId, filters] as const
};

export const useGetCmeksByProjectId = (
  {
    projectId,
    offset = 0,
    limit = 100,
    orderBy = CmekOrderBy.Name,
    orderDirection = OrderByDirection.ASC,
    search = ""
  }: TListProjectCmeksDTO,
  options?: Omit<
    UseQueryOptions<
      TProjectCmeksList,
      unknown,
      TProjectCmeksList,
      ReturnType<typeof cmekKeys.getCmeksByProjectId>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: cmekKeys.getCmeksByProjectId({
      projectId,
      offset,
      limit,
      orderBy,
      orderDirection,
      search
    }),
    queryFn: async () => {
      const { data } = await apiRequest.get<TProjectCmeksList>("/api/v1/kms/keys", {
        params: { projectId, offset, limit, search, orderBy, orderDirection }
      });

      return data;
    },
    enabled: Boolean(projectId) && (options?.enabled ?? true),
    keepPreviousData: true,
    ...options
  });
};
