import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { TExternalGroupOrgRoleMappingList } from "@app/hooks/api/externalGroupOrgRoleMappings/types";

export const externalGroupOrgRoleMappingKeys = {
  all: ["external-group-org-role-mapping"] as const,
  list: () => [...externalGroupOrgRoleMappingKeys.all, "list"] as const
};

export const useGetExternalGroupOrgRoleMappings = (
  options?: Omit<
    UseQueryOptions<
      TExternalGroupOrgRoleMappingList,
      unknown,
      TExternalGroupOrgRoleMappingList,
      ReturnType<typeof externalGroupOrgRoleMappingKeys.list>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: externalGroupOrgRoleMappingKeys.list(),
    queryFn: async () => {
      const { data } = await apiRequest.get<TExternalGroupOrgRoleMappingList>(
        "/api/v1/scim/group-org-role-mappings"
      );

      return data;
    },
    ...options
  });
};
