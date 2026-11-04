import { useMemo } from "react";
import picomatch from "picomatch";

import {
  ProjectPermissionActions,
  ProjectPermissionMemberActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { ProjectType } from "@app/hooks/api/projects/types";
import type { TProjectRole } from "@app/hooks/api/roles/types";
import {
  canModifyByGrantConditions,
  filterByGrantConditions,
  getGroupAssignRoleConditions,
  getMemberAssignRoleConditions
} from "@app/lib/fn/permission";

import { useV4Adapter } from "../../data/adapters";
import { useProjectPermission } from "../permissions";
import { builtInProjectRoleName } from "../roles";

export const PROJECT_TYPE = ProjectType.SecretManager;

export const personName = (user: { firstName?: string | null; lastName?: string | null }) =>
  [user.firstName, user.lastName].filter(Boolean).join(" ") || undefined;

export type ProjectRoleOption = Pick<TProjectRole, "id" | "slug" | "name" | "description">;

const GRANT_ACTIONS = new Set(["grant-privileges", "assign-role", "manage"]);

const withCurrent = (
  assignable: readonly ProjectRoleOption[],
  all: readonly ProjectRoleOption[],
  slug: string
): readonly ProjectRoleOption[] =>
  assignable.some((role) => role.slug === slug)
    ? assignable
    : [
        all.find((role) => role.slug === slug) ?? {
          id: slug,
          slug,
          name: builtInProjectRoleName(slug),
          description: ""
        },
        ...assignable
      ];

export const useMemberRoleAccess = (projectId: string, email?: string) => {
  const { permission } = useProjectPermission(projectId);
  const roles = useV4Adapter("access").useProjectRoles(projectId, PROJECT_TYPE);
  const conditions = useMemo(() => getMemberAssignRoleConditions(permission), [permission]);
  const all = useMemo(() => roles.data ?? [], [roles.data]);
  const assignable = useMemo(
    () =>
      filterByGrantConditions(all, {
        getKey: (role) => role.slug,
        allowed: conditions?.roles,
        forbidden: conditions?.forbiddenRoles
      }),
    [all, conditions]
  );
  const targetAllowed =
    !email ||
    canModifyByGrantConditions({
      targetValue: email,
      allowed: conditions?.emails,
      forbidden: conditions?.forbiddenEmails,
      isMatch: (value, pattern) => picomatch.isMatch(value, pattern)
    });
  return {
    roles: all,
    rolesPending: roles.isPending,
    assignable,
    optionsFor: (slug: string) => withCurrent(assignable, all, slug),
    canEdit:
      permission.can(ProjectPermissionMemberActions.Edit, ProjectPermissionSub.Member) &&
      targetAllowed
  };
};

export const useGroupRoleAccess = (projectId: string, groupName: string) => {
  const { permission } = useProjectPermission(projectId);
  const roles = useV4Adapter("access").useProjectRoles(projectId, PROJECT_TYPE);
  const conditions = useMemo(() => getGroupAssignRoleConditions(permission), [permission]);
  const all = useMemo(() => roles.data ?? [], [roles.data]);
  const assignable = useMemo(
    () =>
      filterByGrantConditions(all, {
        getKey: (role) => role.slug,
        allowed: conditions?.roles,
        forbidden: conditions?.forbiddenRoles
      }),
    [all, conditions]
  );
  const canGrant = permission.rules.some((rule) => {
    if (rule.inverted) return false;
    const subjects = [rule.subject].flat().map(String);
    if (!subjects.includes(ProjectPermissionSub.Groups) && !subjects.includes("all")) return false;
    return [rule.action].flat().some((action) => GRANT_ACTIONS.has(String(action)));
  });
  const targetAllowed =
    !conditions ||
    canModifyByGrantConditions({
      targetValue: groupName,
      allowed: conditions.groupNames,
      forbidden: conditions.forbiddenGroupNames
    });
  return {
    roles: all,
    assignable,
    canEdit:
      permission.can(ProjectPermissionActions.Edit, ProjectPermissionSub.Groups) &&
      canGrant &&
      targetAllowed
  };
};
