import { useMemo } from "react";
import picomatch from "picomatch";

import {
  ProjectPermissionMemberActions,
  ProjectPermissionSub,
  useProject,
  useProjectPermission
} from "@app/context";
import { formatProjectRoleName } from "@app/helpers/roles";
import { useGetProjectRoles } from "@app/hooks/api";
import { TWorkspaceUser } from "@app/hooks/api/types";
import {
  canModifyByGrantConditions,
  filterByGrantConditions,
  getMemberAssignRoleConditions
} from "@app/lib/fn/permission";

// Resolves which project roles the current user may assign to `projectMember`, honouring the
// grant conditions on their own permission (allowed/forbidden roles and target emails). Shared by
// the single- and multi-role editors so both gate role selection the same way.
export const useMemberRoleGrant = (projectMember: TWorkspaceUser) => {
  const { projectId, currentProject } = useProject();
  const { data: projectRoles, isPending: isRolesLoading } = useGetProjectRoles(
    projectId,
    currentProject?.type
  );
  const { permission } = useProjectPermission();

  const isMemberEditDisabled = permission.cannot(
    ProjectPermissionMemberActions.Edit,
    ProjectPermissionSub.Member
  );

  const assignRoleConditions = useMemo(
    () => getMemberAssignRoleConditions(permission),
    [permission]
  );

  const canModifyMemberRoles = useMemo(() => {
    const memberEmail = projectMember?.user?.email;
    if (!memberEmail) return false;

    return canModifyByGrantConditions({
      targetValue: memberEmail,
      allowed: assignRoleConditions?.emails,
      forbidden: assignRoleConditions?.forbiddenEmails,
      isMatch: (value, pattern) => picomatch.isMatch(value, pattern)
    });
  }, [assignRoleConditions, projectMember?.user?.email]);

  const filteredRoles = useMemo(
    () =>
      filterByGrantConditions(projectRoles ?? [], {
        getKey: (role) => role.slug,
        allowed: assignRoleConditions?.roles,
        forbidden: assignRoleConditions?.forbiddenRoles
      }),
    [projectRoles, assignRoleConditions]
  );

  const assignableRoleSlugs = useMemo(
    () => new Set(filteredRoles.map((role) => role.slug)),
    [filteredRoles]
  );

  // The list to show in a role Select: the assignable roles, prepended with the currently
  // assigned role when it isn't itself assignable (so it stays visible but disabled).
  const getRolesForSelect = (currentSlug: string) => {
    if (assignableRoleSlugs.has(currentSlug)) return filteredRoles;

    const currentRole = projectRoles?.find((role) => role.slug === currentSlug) ?? {
      slug: currentSlug,
      name: formatProjectRoleName(currentSlug),
      id: currentSlug
    };
    return [currentRole, ...filteredRoles];
  };

  return {
    isRolesLoading,
    assignableRoleSlugs,
    getRolesForSelect,
    isEditDisabled: isMemberEditDisabled || !canModifyMemberRoles
  };
};
