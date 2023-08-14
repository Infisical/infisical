import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TGetRolesDTO, TRole } from "./types";

export const roleQueryKeys = {
  getRoles: ({ orgId, workspaceId }: TGetRolesDTO) => ["roles", { orgId, workspaceId }] as const
};

const getRoles = async ({ orgId, workspaceId }: TGetRolesDTO) => {
  const { data } = await apiRequest.get<{ data: { roles: TRole[] } }>("/api/v1/roles", {
    params: {
      workspaceId,
      orgId
    }
  });

  return data.data.roles;
};

export const useGetRoles = ({ orgId, workspaceId }: TGetRolesDTO) =>
  useQuery({
    queryKey: roleQueryKeys.getRoles({ orgId, workspaceId }),
    queryFn: () => getRoles({ orgId, workspaceId }),
    enabled: Boolean(orgId)
  });
