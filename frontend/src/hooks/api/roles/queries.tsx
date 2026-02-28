import { buildMongoQueryMatcher, createMongoAbility, MongoAbility, RawRuleOf } from "@casl/ability";
import { PackRule, unpackRules } from "@casl/ability/extra";
import { useQuery } from "@tanstack/react-query";
import { FieldCondition, FieldInstruction, JsInterpreter } from "@ucast/mongo2js";
import picomatch from "picomatch";

import { apiRequest } from "@app/config/request";
import { OrgPermissionSet } from "@app/context/OrgPermissionContext/types";
import { ProjectPermissionSet } from "@app/context/ProjectPermissionContext/types";
import { groupBy } from "@app/lib/fn/array";
import { omit } from "@app/lib/fn/object";

import { ActorType } from "../auditLogs/enums";
import { TUserMembership } from "../users/types";
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

export const conditionsMatcher = buildMongoQueryMatcher({ $glob }, { glob });

export const roleQueryKeys = {
  getProjectRoles: (projectId: string) => ["roles", { projectId }] as const,
  getProjectRoleBySlug: (projectId: string, roleSlug: string) =>
    ["roles", { projectId, roleSlug }] as const,
  getOrgRoles: (orgId: string) => ["org-roles", { orgId }] as const,
  getOrgRole: (orgId: string, roleId: string) => [{ orgId, roleId }, "org-role"] as const,
  getUserOrgPermissions: ({ orgId }: TGetUserOrgPermissionsDTO) =>
    ["user-permissions", { orgId }] as const,
  getUserProjectPermissions: ({ projectId }: TGetUserProjectPermissionDTO) =>
    ["user-project-permissions", { projectId }] as const
};

export const getProjectRoles = async (projectId: string) => {
  const { data } = await apiRequest.get<{ roles: Array<Omit<TProjectRole, "permissions">> }>(
    `/api/v1/projects/${projectId}/roles`
  );
  return data.roles;
};

export const useGetProjectRoles = (projectId: string) =>
  useQuery({
    queryKey: roleQueryKeys.getProjectRoles(projectId),
    queryFn: () => getProjectRoles(projectId),
    enabled: Boolean(projectId)
  });

export const useGetProjectRoleBySlug = (projectId: string, roleSlug: string) =>
  useQuery({
    queryKey: roleQueryKeys.getProjectRoleBySlug(projectId, roleSlug),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ role: TProjectRole }>(
        `/api/v1/projects/${projectId}/roles/slug/${roleSlug}`
      );
      return data.role;
    },
    enabled: Boolean(projectId && roleSlug)
  });

const getOrgRoles = async () => {
  const { data } = await apiRequest.get<{
    roles: Array<Omit<TOrgRole, "permissions"> & { permissions: TPermission[] }>;
  }>("/api/v1/organization/roles");
  return data.roles;
};

export const useGetOrgRoles = (orgId: string, enable = true) =>
  useQuery({
    queryKey: roleQueryKeys.getOrgRoles(orgId),
    queryFn: () => getOrgRoles(),
    enabled: Boolean(orgId) && enable
  });

export const useGetOrgRole = (orgId: string, roleId: string) =>
  useQuery({
    queryKey: roleQueryKeys.getOrgRole(orgId, roleId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{
        role: Omit<TOrgRole, "permissions"> & { permissions: unknown };
      }>(`/api/v1/organization/roles/${roleId}`);
      return {
        ...data.role,
        permissions: data.role.permissions as TPermission[]
      };
    },
    enabled: Boolean(orgId && roleId)
  });

export const fetchUserOrgPermissions = async ({ orgId }: TGetUserOrgPermissionsDTO) => {
  if (orgId === "") return { permissions: [], memberships: [] };

  const { data } = await apiRequest.get<{
    permissions: PackRule<RawRuleOf<MongoAbility<OrgPermissionSet>>>[];
    memberships: Array<TUserMembership & { roles: { role: string }[] }>;
  }>("/api/v1/organization/permissions");

  return data;
};

export const useGetUserOrgPermissions = ({ orgId }: TGetUserOrgPermissionsDTO) =>
  useQuery({
    queryKey: roleQueryKeys.getUserOrgPermissions({ orgId }),
    queryFn: () => fetchUserOrgPermissions({ orgId }),
    // enabled: Boolean(orgId),
    select: (data) => {
      const rule = unpackRules<RawRuleOf<MongoAbility<OrgPermissionSet>>>(data.permissions);
      const ability = createMongoAbility<OrgPermissionSet>(rule, { conditionsMatcher });
      return { permission: ability, memberships: data.memberships };
    }
  });

export const fetchUserProjectPermissions = async ({ projectId }: TGetUserProjectPermissionDTO) => {
  const { data } = await apiRequest.get<{
    data: {
      permissions: PackRule<RawRuleOf<MongoAbility<OrgPermissionSet>>>[];
      memberships: Array<TUserMembership & { roles: { role: string }[] }>;
      assumedPrivilegeDetails?: {
        actorId: string;
        actorType: ActorType;
        actorEmail: string;
        actorName: string;
      };
    };
  }>(`/api/v1/projects/${projectId}/permissions`, {});

  return data.data;
};

export const useGetUserProjectPermissions = ({ projectId }: TGetUserProjectPermissionDTO) =>
  useQuery({
    queryKey: roleQueryKeys.getUserProjectPermissions({ projectId }),
    queryFn: () => fetchUserProjectPermissions({ projectId }),
    enabled: Boolean(projectId),
    select: (data) => {
      const rule = unpackRules<RawRuleOf<MongoAbility<ProjectPermissionSet>>>(data.permissions);
      const negatedRules = groupBy(
        rule.filter((i) => i.inverted && i.conditions),
        (i) => `${i.subject}-${JSON.stringify(i.conditions)}`
      );
      const ability = createMongoAbility<ProjectPermissionSet>(rule, {
        // this allows in frontend to skip some rules using *
        conditionsMatcher: (rules) => {
          return (entity) => {
            // skip validation if its negated rules
            const isNegatedRule =
              // eslint-disable-next-line no-underscore-dangle
              negatedRules?.[`${entity.__caslSubjectType__}-${JSON.stringify(rules)}`];
            if (isNegatedRule) {
              const baseMatcher = conditionsMatcher(rules);
              return baseMatcher(entity);
            }

            const rulesStrippedOfWildcard = omit(
              rules,
              Object.keys(entity).filter((el) => entity[el]?.includes("*"))
            );
            const baseMatcher = conditionsMatcher(rulesStrippedOfWildcard);
            return baseMatcher(entity);
          };
        }
      });

      return { permission: ability, memberships: data.memberships };
    }
  });
