import { AccessScope, OrganizationActionScope } from "@app/db/schemas";
import {
  OrgPermissionIdentityActions,
  OrgPermissionSubjects,
  TOrgPermissionService
} from "@app/domains/platform/organizations/ce/module";
import { BadRequestError, InternalServerError } from "@app/lib/errors";
import { requestMemoKeys } from "@app/lib/request-context/memo-keys";
import { requestMemoize } from "@app/lib/request-context/request-memoizer";
import { TIdentityDALFactory } from "@app/services/identity/identity-dal";
import {
  filterRolesNeedingPrivilegeBoundary,
  resolveMembershipRoleSlugs,
  toBoundsTargets
} from "@app/services/membership/membership-fns";
import { assertPermissionBounds } from "@app/services/membership/permission-bounds";
import { isCustomOrgRole } from "@app/services/org/org-role-fns";

import { TMembershipIdentityDALFactory } from "../membership-identity-dal";
import { TMembershipIdentityScopeFactory } from "../membership-identity-types";

type TOrgMembershipIdentityScopeFactoryDep = {
  orgPermissionService: TOrgPermissionService;
  identityDAL: Pick<TIdentityDALFactory, "findById">;
  membershipIdentityDAL: Pick<TMembershipIdentityDALFactory, "getIdentityById">;
};

export const newOrgMembershipIdentityFactory = ({
  orgPermissionService,
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
    const permission = await orgPermissionService.getOrgPermission({
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

    const permissionRoles = await orgPermissionService.getOrgPermissionByRoles({
      orgId: dto.actor.org.id,
      roles: filterRolesNeedingPrivilegeBoundary(dto.data.roles).map((el) => el.role)
    });

    const { shouldUseNewPrivilegeSystem } = dto.actor.org;
    for (const permissionRole of permissionRoles) {
      assertPermissionBounds(permission, {
        usesNewPrivilegeSystem: shouldUseNewPrivilegeSystem,
        actions: OrgPermissionIdentityActions.GrantPrivileges,
        subject: OrgPermissionSubjects.Identity,
        targets: [{ permission: permissionRole.permission }],
        message: "Failed to update identity org membership"
      });
    }
  };

  const onUpdateMembershipIdentityGuard: TMembershipIdentityScopeFactory["onUpdateMembershipIdentityGuard"] = async (
    dto
  ) => {
    const permission = await orgPermissionService.getOrgPermission({ actor: dto.actor });

    permission.assert({ action: OrgPermissionIdentityActions.Edit, subject: OrgPermissionSubjects.Identity });
    const permissionRoles = await orgPermissionService.getOrgPermissionByRoles({
      orgId: dto.actor.org.id,
      roles: filterRolesNeedingPrivilegeBoundary(dto.data.roles).map((el) => el.role)
    });

    const { shouldUseNewPrivilegeSystem } = dto.actor.org;

    const targetMembership = await membershipIdentityDAL.getIdentityById({
      scopeData: dto.scopeData,
      identityId: dto.selector.identityId
    });
    const targetRoles = targetMembership ? resolveMembershipRoleSlugs(targetMembership.roles) : [];
    const targetPermissions = await orgPermissionService.getOrgPermissionByRoles({
      orgId: dto.actor.org.id,
      roles: targetRoles,
      ignoreUnresolvedRoles: true
    });

    assertPermissionBounds(permission, {
      usesNewPrivilegeSystem: shouldUseNewPrivilegeSystem,
      actions: OrgPermissionIdentityActions.GrantPrivileges,
      subject: OrgPermissionSubjects.Identity,
      targets: toBoundsTargets(targetPermissions),
      message: "Failed to change the roles of a more privileged identity"
    });

    for (const permissionRole of permissionRoles) {
      assertPermissionBounds(permission, {
        usesNewPrivilegeSystem: shouldUseNewPrivilegeSystem,
        actions: OrgPermissionIdentityActions.GrantPrivileges,
        subject: OrgPermissionSubjects.Identity,
        targets: [{ permission: permissionRole.permission }],
        message: "Failed to update identity org membership"
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
    const permission = await orgPermissionService.getOrgPermission({
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
    const targetPermissions = await orgPermissionService.getOrgPermissionByRoles({
      orgId: dto.actor.org.id,
      roles: targetRoles,
      ignoreUnresolvedRoles: true
    });
    const { shouldUseNewPrivilegeSystem } = dto.actor.org;

    assertPermissionBounds(permission, {
      usesNewPrivilegeSystem: shouldUseNewPrivilegeSystem,
      actions: OrgPermissionIdentityActions.Delete,
      subject: OrgPermissionSubjects.Identity,
      targets: toBoundsTargets(targetPermissions),
      message: "Failed to remove a more privileged identity from the organization"
    });
  };

  const onListMembershipIdentityGuard: TMembershipIdentityScopeFactory["onListMembershipIdentityGuard"] = async (
    dto
  ) => {
    const permission = await orgPermissionService.getOrgPermission({ actor: dto.actor });
    permission.assert({ action: OrgPermissionIdentityActions.Read, subject: OrgPermissionSubjects.Identity });

    return () => true;
  };

  const onGetMembershipIdentityByIdentityIdGuard: TMembershipIdentityScopeFactory["onGetMembershipIdentityByIdentityIdGuard"] =
    async (dto) => {
      const permission = await orgPermissionService.getOrgPermission({ actor: dto.actor });
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
