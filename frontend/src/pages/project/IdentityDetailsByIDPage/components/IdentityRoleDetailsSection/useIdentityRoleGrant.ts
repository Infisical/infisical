import { useMemo } from "react";

import {
  ProjectPermissionIdentityActions,
  ProjectPermissionSub,
  useProject,
  useProjectPermission
} from "@app/context";
import { formatProjectRoleName } from "@app/helpers/roles";
import { useGetProjectRoles } from "@app/hooks/api";
import { IdentityProjectMembershipV1 } from "@app/hooks/api/identities/types";
import {
  canModifyByGrantConditions,
  filterByGrantConditions,
  getIdentityAssignRoleConditions
} from "@app/lib/fn/permission";

export const useIdentityRoleGrant = (identityProjectMembership: IdentityProjectMembershipV1) => {
  const { projectId, currentProject } = useProject();
  const { data: projectRoles, isPending: isRolesLoading } = useGetProjectRoles(
    projectId,
    currentProject?.type
  );
  const { permission } = useProjectPermission();

  const assignRoleConditions = useMemo(
    () => getIdentityAssignRoleConditions(permission),
    [permission]
  );

  const canModifyIdentityRoles = useMemo(() => {
    const targetIdentityId = identityProjectMembership?.identity?.id;
    if (!targetIdentityId) return false;

    return canModifyByGrantConditions({
      targetValue: targetIdentityId,
      allowed: assignRoleConditions?.identityIds,
      forbidden: assignRoleConditions?.forbiddenIdentityIds
    });
  }, [assignRoleConditions, identityProjectMembership?.identity?.id]);

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
    filteredRoles,
    isRolesLoading,
    assignableRoleSlugs,
    getRolesForSelect,
    isEditDisabled:
      permission.cannot(ProjectPermissionIdentityActions.Edit, ProjectPermissionSub.Identity) ||
      !canModifyIdentityRoles
  };
};
