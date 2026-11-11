import { AccessScope, getAdminMemberOnlyProductLabel, ProjectMembershipRole } from "@app/db/schemas";
import {
  assertRoleSetBoundary,
  constructPermissionErrorMessage,
  validatePrivilegeChangeOperation
} from "@app/domains/platform/access-control/ce/module";
import {
  isCustomProjectRole,
  ProjectPermissionIdentityActions,
  ProjectPermissionSub,
  TProjectsDomain
} from "@app/domains/platform/projects/ce/module";
import { BadRequestError, InternalServerError, PermissionBoundaryError } from "@app/lib/errors";
import { requestMemoKeys } from "@app/lib/request-context/memo-keys";
import { requestMemoize } from "@app/lib/request-context/request-memoizer";
import { TIdentityDALFactory } from "@app/services/identity/identity-dal";
import {
  filterRolesNeedingPrivilegeBoundary,
  resolveMembershipRoleSlugs,
  toRoleAbilities
} from "@app/services/membership/membership-fns";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";

import { TMembershipIdentityDALFactory } from "../membership-identity-dal";
import { TMembershipIdentityScopeFactory } from "../membership-identity-types";

type TProjectMembershipIdentityScopeFactoryDep = {
  projectsDomain: Pick<TProjectsDomain, "getProjectPermission" | "getProjectPermissionByRoles">;

  identityDAL: Pick<TIdentityDALFactory, "findById">;
  orgDAL: Pick<TOrgDALFactory, "findActorsWithActiveOrgAccess">;
  membershipIdentityDAL: Pick<TMembershipIdentityDALFactory, "getIdentityById">;
  projectDAL: Pick<TProjectDALFactory, "findById">;
};

export const newProjectMembershipIdentityFactory = ({
  projectsDomain,
  orgDAL,
  identityDAL,
  projectDAL,
  membershipIdentityDAL
}: TProjectMembershipIdentityScopeFactoryDep): TMembershipIdentityScopeFactory => {
  const getScopeField: TMembershipIdentityScopeFactory["getScopeField"] = (dto) => {
    if (dto.scope === AccessScope.Project) {
      return { key: "projectId" as const, value: dto.projectId };
    }
    throw new InternalServerError({ message: "Invalid scope provided for the project factory" });
  };

  const getScopeDatabaseFields: TMembershipIdentityScopeFactory["getScopeDatabaseFields"] = (dto) => {
    if (dto.scope === AccessScope.Project) {
      return { scopeOrgId: dto.orgId, scopeProjectId: dto.projectId };
    }
    throw new InternalServerError({ message: "Invalid scope provided for the project factory" });
  };

  const isCustomRole: TMembershipIdentityScopeFactory["isCustomRole"] = (role) => isCustomProjectRole(role);

  // Same add rule as everywhere else (findActorsWithActiveOrgAccess). Reconcile revokes the row if the group
  // path goes.
  const assertOrgAccess = async (identityId: string, orgId: string) => {
    const withOrgAccess = await orgDAL.findActorsWithActiveOrgAccess({ orgId, userIds: [], identityIds: [identityId] });
    if (!withOrgAccess.identityIds.has(identityId)) {
      throw new BadRequestError({
        message: `Machine identity '${identityId}' is not an active member of this organization`
      });
    }
  };

  const onCreateMembershipIdentityGuard: TMembershipIdentityScopeFactory["onCreateMembershipIdentityGuard"] = async (
    dto
  ) => {
    const scope = getScopeField(dto.scopeData);
    const permission = await projectsDomain.getProjectPermission({ actor: dto.actor, projectId: scope.value });
    permission.assert({ action: ProjectPermissionIdentityActions.Create, subject: ProjectPermissionSub.Identity });

    const project = await requestMemoize(requestMemoKeys.projectFindById(scope.value), () =>
      projectDAL.findById(scope.value)
    );
    const adminMemberOnlyLabel = getAdminMemberOnlyProductLabel(project?.type);
    if (adminMemberOnlyLabel) {
      const invalidRoles = dto.data.roles.filter(
        (r) => r.role !== ProjectMembershipRole.Admin && r.role !== ProjectMembershipRole.Member
      );
      if (invalidRoles.length > 0) {
        throw new BadRequestError({
          message: `${adminMemberOnlyLabel} only supports Admin and Member roles.`
        });
      }
      // One role per membership: the product routes write exactly one, and their member lists read one.
      if (dto.data.roles.length > 1) {
        throw new BadRequestError({
          message: `${adminMemberOnlyLabel} memberships hold a single role.`
        });
      }
    }

    await assertOrgAccess(dto.data.identityId, dto.actor.org.id);

    const identityDetails = await requestMemoize(requestMemoKeys.identityFindById(dto.data.identityId), () =>
      identityDAL.findById(dto.data.identityId)
    );
    if (identityDetails.projectId) {
      throw new BadRequestError({ message: "Failed to create project membership for a project scoped identity" });
    }

    const { shouldUseNewPrivilegeSystem } = dto.actor.org;
    const permissionRoles = await projectsDomain.getProjectPermissionByRoles({
      projectId: scope.value,
      roles: filterRolesNeedingPrivilegeBoundary(dto.data.roles).map((el) => el.role)
    });
    for (const permissionRole of permissionRoles) {
      const permissionBoundary = validatePrivilegeChangeOperation(
        shouldUseNewPrivilegeSystem,
        [ProjectPermissionIdentityActions.AssignRole, ProjectPermissionIdentityActions.GrantPrivileges],
        ProjectPermissionSub.Identity,
        permission.toAbility(),
        permissionRole.permission.toAbility(),
        {
          identityId: identityDetails.id,
          assignableRole: permissionRole.role?.slug
        }
      );

      if (!permissionBoundary.isValid)
        throw new PermissionBoundaryError({
          message: constructPermissionErrorMessage(
            "Failed to create identity project membership",
            shouldUseNewPrivilegeSystem,
            ProjectPermissionIdentityActions.AssignRole,
            ProjectPermissionSub.Identity
          ),
          details: { missingPermissions: permissionBoundary.missingPermissions }
        });
    }
  };

  const onUpdateMembershipIdentityGuard: TMembershipIdentityScopeFactory["onUpdateMembershipIdentityGuard"] = async (
    dto
  ) => {
    const scope = getScopeField(dto.scopeData);
    const permission = await projectsDomain.getProjectPermission({ actor: dto.actor, projectId: scope.value });
    permission.assert({
      action: ProjectPermissionIdentityActions.Edit,
      subject: ProjectPermissionSub.Identity,
      fields: { identityId: dto.selector.identityId }
    });

    const project = await requestMemoize(requestMemoKeys.projectFindById(scope.value), () =>
      projectDAL.findById(scope.value)
    );
    const adminMemberOnlyLabel = getAdminMemberOnlyProductLabel(project?.type);
    if (adminMemberOnlyLabel) {
      const invalidRoles = dto.data.roles.filter(
        (r) => r.role !== ProjectMembershipRole.Admin && r.role !== ProjectMembershipRole.Member
      );
      if (invalidRoles.length > 0) {
        throw new BadRequestError({
          message: `${adminMemberOnlyLabel} only supports Admin and Member roles.`
        });
      }
      // One role per membership: the product routes write exactly one, and their member lists read one.
      if (dto.data.roles.length > 1) {
        throw new BadRequestError({
          message: `${adminMemberOnlyLabel} memberships hold a single role.`
        });
      }
    }

    const identityDetails = await requestMemoize(requestMemoKeys.identityFindById(dto.selector.identityId), () =>
      identityDAL.findById(dto.selector.identityId)
    );
    if (identityDetails.projectId && identityDetails.projectId !== scope.value) {
      throw new BadRequestError({ message: "Failed to update project membership for a project scoped identity" });
    }
    if (!identityDetails.projectId) {
      await assertOrgAccess(dto.selector.identityId, dto.actor.org.id);
    }

    const { shouldUseNewPrivilegeSystem } = dto.actor.org;

    const targetMembership = await membershipIdentityDAL.getIdentityById({
      scopeData: dto.scopeData,
      identityId: dto.selector.identityId
    });
    const targetRoles = targetMembership ? resolveMembershipRoleSlugs(targetMembership.roles) : [];
    const targetPermissions = await projectsDomain.getProjectPermissionByRoles({
      projectId: scope.value,
      roles: targetRoles,
      ignoreUnresolvedRoles: true
    });
    assertRoleSetBoundary({
      shouldUseNewPrivilegeSystem,
      opActions: [ProjectPermissionIdentityActions.AssignRole, ProjectPermissionIdentityActions.GrantPrivileges],
      opSubject: ProjectPermissionSub.Identity,
      actorPermission: permission.toAbility(),
      targetPermissions: toRoleAbilities(targetPermissions),
      baseMessage: "Failed to change the roles of a more privileged identity",
      subjectFields: { identityId: dto.selector.identityId }
    });

    const permissionRoles = await projectsDomain.getProjectPermissionByRoles({
      projectId: scope.value,
      roles: filterRolesNeedingPrivilegeBoundary(dto.data.roles).map((el) => el.role)
    });
    for (const permissionRole of permissionRoles) {
      const permissionBoundary = validatePrivilegeChangeOperation(
        shouldUseNewPrivilegeSystem,
        [ProjectPermissionIdentityActions.AssignRole, ProjectPermissionIdentityActions.GrantPrivileges],
        ProjectPermissionSub.Identity,
        permission.toAbility(),
        permissionRole.permission.toAbility(),
        {
          identityId: identityDetails.id,
          assignableRole: permissionRole.role?.slug
        }
      );

      if (!permissionBoundary.isValid)
        throw new PermissionBoundaryError({
          message: constructPermissionErrorMessage(
            "Failed to update identity project membership",
            shouldUseNewPrivilegeSystem,
            ProjectPermissionIdentityActions.AssignRole,
            ProjectPermissionSub.Identity
          ),
          details: { missingPermissions: permissionBoundary.missingPermissions }
        });
    }
  };

  const onDeleteMembershipIdentityGuard: TMembershipIdentityScopeFactory["onDeleteMembershipIdentityGuard"] = async (
    dto
  ) => {
    const scope = getScopeField(dto.scopeData);
    const permission = await projectsDomain.getProjectPermission({ actor: dto.actor, projectId: scope.value });

    permission.assert({
      action: ProjectPermissionIdentityActions.Delete,
      subject: ProjectPermissionSub.Identity,
      fields: { identityId: dto.selector.identityId }
    });

    const identityDetails = await requestMemoize(requestMemoKeys.identityFindById(dto.selector.identityId), () =>
      identityDAL.findById(dto.selector.identityId)
    );
    if (identityDetails.projectId) {
      throw new BadRequestError({ message: "Failed to delete project membership for a project scoped identity" });
    }

    const targetMembership = await membershipIdentityDAL.getIdentityById({
      scopeData: dto.scopeData,
      identityId: dto.selector.identityId
    });
    const targetRoles = targetMembership ? resolveMembershipRoleSlugs(targetMembership.roles) : [];
    const targetPermissions = await projectsDomain.getProjectPermissionByRoles({
      projectId: scope.value,
      roles: targetRoles,
      ignoreUnresolvedRoles: true
    });
    const { shouldUseNewPrivilegeSystem } = dto.actor.org;

    assertRoleSetBoundary({
      shouldUseNewPrivilegeSystem,
      opActions: ProjectPermissionIdentityActions.Delete,
      opSubject: ProjectPermissionSub.Identity,
      actorPermission: permission.toAbility(),
      targetPermissions: toRoleAbilities(targetPermissions),
      baseMessage: "Failed to remove a more privileged identity from the project",
      subjectFields: { identityId: dto.selector.identityId }
    });
  };

  const onListMembershipIdentityGuard: TMembershipIdentityScopeFactory["onListMembershipIdentityGuard"] = async (
    dto
  ) => {
    const scope = getScopeField(dto.scopeData);
    const permission = await projectsDomain.getProjectPermission({ actor: dto.actor, projectId: scope.value });

    permission.assert({ action: ProjectPermissionIdentityActions.Read, subject: ProjectPermissionSub.Identity });

    return (arg) =>
      permission.can({
        action: ProjectPermissionIdentityActions.Read,
        subject: ProjectPermissionSub.Identity,
        fields: { identityId: arg.identityId }
      });
  };

  const onGetMembershipIdentityByIdentityIdGuard: TMembershipIdentityScopeFactory["onGetMembershipIdentityByIdentityIdGuard"] =
    async (dto) => {
      const scope = getScopeField(dto.scopeData);
      const permission = await projectsDomain.getProjectPermission({ actor: dto.actor, projectId: scope.value });

      permission.assert({
        action: ProjectPermissionIdentityActions.Read,
        subject: ProjectPermissionSub.Identity,
        fields: { identityId: dto.selector.identityId }
      });
    };

  return {
    onCreateMembershipIdentityGuard,
    onUpdateMembershipIdentityGuard,
    onDeleteMembershipIdentityGuard,
    onListMembershipIdentityGuard,
    onGetMembershipIdentityByIdentityIdGuard,
    getScopeField,
    getScopeDatabaseFields,
    isCustomRole
  };
};
