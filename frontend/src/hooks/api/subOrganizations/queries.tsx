import { queryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TListSubOrganizationsDTO, TSubOrganization } from "./types";

export const subOrganizationsQuery = {
  allKey: () => ["sub-organizations"] as const,
  listKey: (params?: TListSubOrganizationsDTO) =>
    [...subOrganizationsQuery.allKey(), "list", params] as const,
  list: (params: TListSubOrganizationsDTO) =>
    queryOptions({
      queryKey: subOrganizationsQuery.listKey(params),
      queryFn: async () => {
        const { data } = await apiRequest.get<{ organizations: TSubOrganization[] }>(
          "/api/v1/sub-organizations",
          {
            params: {
              limit: params.limit,
              offset: params.offset,
              isAccessible: params.isAccessible
            }
          }
        );
        return data.organizations;
      }
    })
};
