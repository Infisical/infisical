import { buildMongoQueryMatcher, createMongoAbility, MongoAbility, RawRuleOf } from "@casl/ability";
import { PackRule, unpackRules } from "@casl/ability/extra";
import { useQuery } from "@tanstack/react-query";
import { FieldCondition, FieldInstruction, JsInterpreter } from "@ucast/mongo2js";
import picomatch from "picomatch";

import { apiRequest } from "@app/config/request";
import { OrgPermissionSet } from "@app/context/OrgPermissionContext/types";
import { ProjectPermissionSet } from "@app/context/ProjectPermissionContext/types";

import { OrgUser } from "../users/types";
import {
  TGetRolesDTO,
  TGetUserOrgPermissionsDTO,
  TGetUserProjectPermissionDTO,
  TRole
} from "./types";

const $glob: FieldInstruction<string> = {
  type: "field",
  validate(instruction, value) {
    if (typeof value !== "string") {
      throw new Error(`"${instruction.name}" expects value to be a string`);
    }
  }
};

const glob: JsInterpreter<FieldCondition<string>> = (node, object, context) => {
  const secretPath = context.get(object, node.field);
  const permissionSecretGlobPath = node.value;
  if (!secretPath) return false;
  return picomatch.isMatch(secretPath, permissionSecretGlobPath, { strictSlashes: false });
};

const conditionsMatcher = buildMongoQueryMatcher({ $glob }, { glob });

export const roleQueryKeys = {
  getRoles: ({ orgId, workspaceId }: TGetRolesDTO) => ["roles", { orgId, workspaceId }] as const,
  getUserOrgPermissions: ({ orgId }: TGetUserOrgPermissionsDTO) =>
    ["user-permissions", { orgId }] as const,
  getUserProjectPermissions: ({ workspaceId }: TGetUserProjectPermissionDTO) =>
    ["user-project-permissions", { workspaceId }] as const
};

const getRoles = async ({ orgId, workspaceId }: TGetRolesDTO) => {
  const { data } = await apiRequest.get<{ data: { roles: TRole<typeof workspaceId>[] } }>(
    "/api/v1/roles",
    {
      params: {
        workspaceId,
        orgId
      }
    }
  );

  return data.data.roles;
};

export const useGetRoles = ({ orgId, workspaceId }: TGetRolesDTO) =>
  useQuery({
    queryKey: roleQueryKeys.getRoles({ orgId, workspaceId }),
    queryFn: () => getRoles({ orgId, workspaceId }),
    enabled: Boolean(orgId)
  });

const getUserOrgPermissions = async ({ orgId }: TGetUserOrgPermissionsDTO) => {
  if (orgId === "") return { permissions: [], membership: null };

  const { data } = await apiRequest.get<{
    data: {
      permissions: PackRule<RawRuleOf<MongoAbility<OrgPermissionSet>>>[];
      membership: OrgUser;
    };
  }>(`/api/v1/roles/organization/${orgId}/permissions`);

  return data.data;
};

export const useGetUserOrgPermissions = ({ orgId }: TGetUserOrgPermissionsDTO) =>
  useQuery({
    queryKey: roleQueryKeys.getUserOrgPermissions({ orgId }),
    queryFn: () => getUserOrgPermissions({ orgId }),
    // enabled: Boolean(orgId),
    select: (data) => {
      const rule = unpackRules<RawRuleOf<MongoAbility<OrgPermissionSet>>>(data.permissions);
      const ability = createMongoAbility<OrgPermissionSet>(rule, { conditionsMatcher });
      return { permission: ability, membership: data.membership };
    }
  });

const getUserProjectPermissions = async ({ workspaceId }: TGetUserProjectPermissionDTO) => {
  const { data } = await apiRequest.get<{
    data: { permissions: PackRule<RawRuleOf<MongoAbility<OrgPermissionSet>>>[] };
  }>(`/api/v1/roles/workspace/${workspaceId}/permissions`, {});

  return data.data.permissions;
};

export const useGetUserProjectPermissions = ({ workspaceId }: TGetUserProjectPermissionDTO) =>
  useQuery({
    queryKey: roleQueryKeys.getUserProjectPermissions({ workspaceId }),
    queryFn: () => getUserProjectPermissions({ workspaceId }),
    enabled: Boolean(workspaceId),
    select: (data) => {
      const rule = unpackRules<RawRuleOf<MongoAbility<ProjectPermissionSet>>>(data);
      const ability = createMongoAbility<ProjectPermissionSet>(rule, { conditionsMatcher });
      return ability;
    }
  });
