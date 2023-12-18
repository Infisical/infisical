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
  TGetUserOrgPermissionsDTO,
  TGetUserProjectPermissionDTO,
  TOrgRole,
  TPermission,
  TProjectRole
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
  getProjectRoles: (projectId: string) => ["roles", { projectId }] as const,
  getOrgRoles: (orgId: string) => ["org-roles", { orgId }] as const,
  getUserOrgPermissions: ({ orgId }: TGetUserOrgPermissionsDTO) =>
    ["user-permissions", { orgId }] as const,
  getUserProjectPermissions: ({ workspaceId }: TGetUserProjectPermissionDTO) =>
    ["user-project-permissions", { workspaceId }] as const
};

const getProjectRoles = async (projectId: string) => {
  const { data } = await apiRequest.get<{
    data: { roles: Array<Omit<TProjectRole, "permissions"> & { permissions: unknown }> };
  }>(`/api/ee/v1/workspace/${projectId}/roles`);
  return data.data.roles.map(({ permissions, ...el }) => ({
    ...el,
    permissions: unpackRules(permissions as PackRule<TPermission>[])
  }));
};

export const useGetProjectRoles = (projectId: string) =>
  useQuery({
    queryKey: roleQueryKeys.getProjectRoles(projectId),
    queryFn: () => getProjectRoles(projectId),
    enabled: Boolean(projectId)
  });

const getOrgRoles = async (orgId: string) => {
  const { data } = await apiRequest.get<{
    data: { roles: Array<Omit<TOrgRole, "permissions"> & { permissions: unknown }> };
  }>(`/api/ee/v1/organization/${orgId}/roles`);
  return data.data.roles.map(({ permissions, ...el }) => ({
    ...el,
    permissions: unpackRules(permissions as PackRule<TPermission>[])
  }));
};

export const useGetOrgRoles = (orgId: string, enable = true) =>
  useQuery({
    queryKey: roleQueryKeys.getOrgRoles(orgId),
    queryFn: () => getOrgRoles(orgId),
    enabled: Boolean(orgId) && enable
  });

const getUserOrgPermissions = async ({ orgId }: TGetUserOrgPermissionsDTO) => {
  if (orgId === "") return { permissions: [], membership: null };

  const { data } = await apiRequest.get<{
    permissions: PackRule<RawRuleOf<MongoAbility<OrgPermissionSet>>>[];
    membership: OrgUser;
  }>(`/api/ee/v1/organization/${orgId}/permissions`);

  return data;
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
  }>(`/api/ee/v1/workspace/${workspaceId}/permissions`, {});

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
