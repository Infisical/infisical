import { createMongoAbility, MongoAbility, RawRuleOf } from "@casl/ability";
import { PackRule, unpackRules } from "@casl/ability/extra";
import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { OrgPermissionSet } from "@app/context/OrgPermissionContext/types";

import { TGetRolesDTO, TGetUserOrgPermissionsDTO, TRole } from "./types";

export const roleQueryKeys = {
  getRoles: ({ orgId, workspaceId }: TGetRolesDTO) => ["roles", { orgId, workspaceId }] as const,
  getUserOrgPermissions: ({ orgId }: TGetUserOrgPermissionsDTO) =>
    ["user-permissions", { orgId }] as const
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

const getUserOrgPermissions = async ({ orgId }: TGetUserOrgPermissionsDTO) => {
  const { data } = await apiRequest.get<{
    data: { permissions: PackRule<RawRuleOf<MongoAbility<OrgPermissionSet>>>[] };
  }>(`/api/v1/roles/${orgId}/permissions`, {});

  return data.data.permissions;
};

export const useGetUserOrgPermissions = ({ orgId }: TGetUserOrgPermissionsDTO) =>
  useQuery({
    queryKey: roleQueryKeys.getUserOrgPermissions({ orgId }),
    queryFn: () => getUserOrgPermissions({ orgId }),
    enabled: Boolean(orgId),
    select: (data) => {
      const rule = unpackRules<RawRuleOf<MongoAbility<OrgPermissionSet>>>(data);
      const ability = createMongoAbility<OrgPermissionSet>(rule);
      return ability;
    }
  });
