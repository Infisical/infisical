import { AccessScope, OrganizationActionScope } from "@app/db/schemas";
import {
  OrgPermissionIdentityActions,
  OrgPermissionSubjects,
  TOrganizationsDomain
} from "@app/domains/platform/organizations/ce/module";
import {
  assertRoleSetBoundary,
  constructPermissionErrorMessage,
  validatePrivilegeChangeOperation
} from "@app/ee/services/permission/permission-fns";
import { BadRequestError, InternalServerError, PermissionBoundaryError } from "@app/lib/errors";
import { requestMemoKeys } from "@app/lib/request-context/memo-keys";
import { requestMemoize } from "@app/lib/request-context/request-memoizer";
import { TIdentityDALFactory } from "@app/services/identity/identity-dal";
import {
  filterRolesNeedingPrivilegeBoundary,
  resolveMembershipRoleSlugs,
  toRoleAbilities
} from "@app/services/membership/membership-fns";
import { isCustomOrgRole } from "@app/services/org/org-role-fns";

import { TMembershipIdentityDALFactory } from "../membership-identity-dal";
import { TMembershipIdentityScopeFactory } from "../membership-identity-types";

type TOrgMembershipIdentityScopeFactoryDep = {
  organizationsDomain: Pick<TOrganizationsDomain, "getOrgPermission" | "getOrgPermissionByRoles">;
  identityDAL: Pick<TIdentityDALFactory, "findById">;
  membershipIdentityDAL: Pick<TMembershipIdentityDALFactory, "getIdentityById">;
};

export const newOrgMembershipIdentityFactory = ({
  organizationsDomain,
  identityDAL,
  membershipIdentityDAL
}: TOrgMembershipIdentityScopeFactoryDep): TMembershipIdentityScopeFactory => {
  const getScopeField: TMembershipIdentityScopeFactory["getScopeField"] = (dto) => {
    if (dto.scope === AccessScope.Organization) {
      return { key: "orgId" as const, value: dto.orgId };
    }
    throw new InternalServerError({ message: "Invalid scope provided for the org factory" });
  };

  const getScopeDatabaseFields: TMembershipIdentityScopeFactory["getScopeDatabaseFields"] = (dto) => {
    if (dto.scope === AccessScope.Organization) {
      return { scopeOrgId: dto.orgId };
    }
    throw new InternalServerError({ message: "Invalid scope provided for the org factory" });
  };

  const isCustomRole: TMembershipIdentityScopeFactory["isCustomRole"] = (role: string) => isCustomOrgRole(role);

  const onCreateMembershipIdentityGuard: TMembershipIdentityScopeFactory["onCreateMembershipIdentityGuard"] = async (
    dto
  ) => {
    const permission = await organizationsDomain.getOrgPermission({
      actor: dto.actor,
      scope: OrganizationActionScope.ChildOrganization
    });

    permission.assert({ action: OrgPermissionIdentityActions.Create, subject: OrgPermissionSubjects.Identity });

    const identityDetails = await requestMemoize(requestMemoKeys.identityFindById(dto.data.identityId), () =>
      identityDAL.findById(dto.data.identityId)
    );
    if (identityDetails.orgId !== dto.actor.org.rootOrgId) {
      throw new BadRequestError({ message: "Only identities from parent organization can be invited" });
    }

    if (identityDetails.projectId) {
      throw new BadRequestError({ message: "Failed to create organization membership for a project scoped identity" });
    }

    const permissionRoles = await organizationsDomain.getOrgPermissionByRoles({
      orgId: dto.actor.org.id,
      roles: filterRolesNeedingPrivilegeBoundary(dto.data.roles).map((el) => el.role)
    });

    const { shouldUseNewPrivilegeSystem } = dto.actor.org;
    for (const permissionRole of permissionRoles) {
      const permissionBoundary = validatePrivilegeChangeOperation(
        shouldUseNewPrivilegeSystem,
        OrgPermissionIdentityActions.GrantPrivileges,
        OrgPermissionSubjects.Identity,
        permission.toAbility(),
        permissionRole.permission.toAbility()
      );
      if (!permissionBoundary.isValid)
        throw new PermissionBoundaryError({
          message: constructPermissionErrorMessage(
            "Failed to update identity org membership",
            shouldUseNewPrivilegeSystem,
            OrgPermissionIdentityActions.GrantPrivileges,
            OrgPermissionSubjects.Identity
          ),
          details: { missingPermissions: permissionBoundary.missingPermissions }
        });
    }
  };

  const onUpdateMembershipIdentityGuard: TMembershipIdentityScopeFactory["onUpdateMembershipIdentityGuard"] = async (
    dto
  ) => {
    const permission = await organizationsDomain.getOrgPermission({ actor: dto.actor });

    permission.assert({ action: OrgPermissionIdentityActions.Edit, subject: OrgPermissionSubjects.Identity });
    const permissionRoles = await organizationsDomain.getOrgPermissionByRoles({
      orgId: dto.actor.org.id,
      roles: filterRolesNeedingPrivilegeBoundary(dto.data.roles).map((el) => el.role)
    });

    const { shouldUseNewPrivilegeSystem } = dto.actor.org;

    const targetMembership = await membershipIdentityDAL.getIdentityById({
      scopeData: dto.scopeData,
      identityId: dto.selector.identityId
    });
    const targetRoles = targetMembership ? resolveMembershipRoleSlugs(targetMembership.roles) : [];
    const targetPermissions = await organizationsDomain.getOrgPermissionByRoles({
      orgId: dto.actor.org.id,
      roles: targetRoles,
      ignoreUnresolvedRoles: true
    });

    assertRoleSetBoundary({
      shouldUseNewPrivilegeSystem,
      opActions: OrgPermissionIdentityActions.GrantPrivileges,
      opSubject: OrgPermissionSubjects.Identity,
      actorPermission: permission.toAbility(),
      targetPermissions: toRoleAbilities(targetPermissions),
      baseMessage: "Failed to change the roles of a more privileged identity"
    });

    for (const permissionRole of permissionRoles) {
      const permissionBoundary = validatePrivilegeChangeOperation(
        shouldUseNewPrivilegeSystem,
        OrgPermissionIdentityActions.GrantPrivileges,
        OrgPermissionSubjects.Identity,
        permission.toAbility(),
        permissionRole.permission.toAbility()
      );
      if (!permissionBoundary.isValid)
        throw new PermissionBoundaryError({
          message: constructPermissionErrorMessage(
            "Failed to update identity org membership",
            shouldUseNewPrivilegeSystem,
            OrgPermissionIdentityActions.GrantPrivileges,
            OrgPermissionSubjects.Identity
          ),
          details: { missingPermissions: permissionBoundary.missingPermissions }
        });
    }

    const identityDetails = await requestMemoize(requestMemoKeys.identityFindById(dto.selector.identityId), () =>
      identityDAL.findById(dto.selector.identityId)
    );
    if (identityDetails.projectId) {
      throw new BadRequestError({ message: "Failed to create organization membership for a project scoped identity" });
    }
  };

  const onDeleteMembershipIdentityGuard: TMembershipIdentityScopeFactory["onDeleteMembershipIdentityGuard"] = async (
    dto
  ) => {
    const permission = await organizationsDomain.getOrgPermission({
      actor: dto.actor,
      scope: OrganizationActionScope.ChildOrganization
    });

    permission.assert({ action: OrgPermissionIdentityActions.Delete, subject: OrgPermissionSubjects.Identity });

    const identityDetails = await requestMemoize(requestMemoKeys.identityFindById(dto.selector.identityId), () =>
      identityDAL.findById(dto.selector.identityId)
    );
    if (identityDetails.orgId !== dto.actor.org.rootOrgId) {
      throw new BadRequestError({ message: "Only identities from parent organization can do this operation" });
    }

    if (identityDetails.orgId === dto.actor.org.id) {
      throw new BadRequestError({ message: "Identity cannot exist as orphan" });
    }

    if (identityDetails.projectId) {
      throw new BadRequestError({ message: "Failed to create organization membership for a project scoped identity" });
    }

    const targetMembership = await membershipIdentityDAL.getIdentityById({
      scopeData: dto.scopeData,
      identityId: dto.selector.identityId
    });
    const targetRoles = targetMembership ? resolveMembershipRoleSlugs(targetMembership.roles) : [];
    const targetPermissions = await organizationsDomain.getOrgPermissionByRoles({
      orgId: dto.actor.org.id,
      roles: targetRoles,
      ignoreUnresolvedRoles: true
    });
    const { shouldUseNewPrivilegeSystem } = dto.actor.org;

    assertRoleSetBoundary({
      shouldUseNewPrivilegeSystem,
      opActions: OrgPermissionIdentityActions.Delete,
      opSubject: OrgPermissionSubjects.Identity,
      actorPermission: permission.toAbility(),
      targetPermissions: toRoleAbilities(targetPermissions),
      baseMessage: "Failed to remove a more privileged identity from the organization"
    });
  };

  const onListMembershipIdentityGuard: TMembershipIdentityScopeFactory["onListMembershipIdentityGuard"] = async (
    dto
  ) => {
    const permission = await organizationsDomain.getOrgPermission({ actor: dto.actor });
    permission.assert({ action: OrgPermissionIdentityActions.Read, subject: OrgPermissionSubjects.Identity });

    return () => true;
  };

  const onGetMembershipIdentityByIdentityIdGuard: TMembershipIdentityScopeFactory["onGetMembershipIdentityByIdentityIdGuard"] =
    async (dto) => {
      const permission = await organizationsDomain.getOrgPermission({ actor: dto.actor });
      permission.assert({ action: OrgPermissionIdentityActions.Read, subject: OrgPermissionSubjects.Identity });
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
