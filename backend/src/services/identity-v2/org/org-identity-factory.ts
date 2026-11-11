import { AccessScope } from "@app/db/schemas";
import {
  OrgPermissionIdentityActions,
  OrgPermissionSubjects,
  TOrganizationsDomain
} from "@app/domains/platform/organizations/ce/module";
import { assertRoleSetBoundary } from "@app/ee/services/permission/permission-fns";
import { InternalServerError } from "@app/lib/errors";
import { TMembershipIdentityDALFactory } from "@app/services/membership-identity/membership-identity-dal";
import { resolveMembershipRoleSlugs } from "@app/services/membership/membership-fns";

import { TIdentityV2Factory } from "../identity-types";

type TOrgIdentityFactoryDep = {
  organizationsDomain: Pick<TOrganizationsDomain, "getOrgPermission" | "getOrgPermissionByRoles">;
  membershipIdentityDAL: Pick<TMembershipIdentityDALFactory, "getIdentityById">;
};

export const newOrgIdentityFactory = ({
  organizationsDomain,
  membershipIdentityDAL
}: TOrgIdentityFactoryDep): TIdentityV2Factory => {
  const getScopeField: TIdentityV2Factory["getScopeField"] = (scopeData) => {
    if (scopeData.scope === AccessScope.Organization) {
      return { key: "orgId" as const, value: scopeData.orgId };
    }
    throw new InternalServerError({ message: "Invalid scope provided for the org factory" });
  };

  const onCreateIdentityGuard: TIdentityV2Factory["onCreateIdentityGuard"] = async (dto) => {
    const permission = await organizationsDomain.getOrgPermission({ actor: dto.actor });
    permission.assert({ action: OrgPermissionIdentityActions.Create, subject: OrgPermissionSubjects.Identity });
  };

  const onUpdateIdentityGuard: TIdentityV2Factory["onUpdateIdentityGuard"] = async (dto) => {
    const permission = await organizationsDomain.getOrgPermission({ actor: dto.actor });
    permission.assert({ action: OrgPermissionIdentityActions.Edit, subject: OrgPermissionSubjects.Identity });
  };

  const onDeleteIdentityGuard: TIdentityV2Factory["onDeleteIdentityGuard"] = async (dto) => {
    const permission = await organizationsDomain.getOrgPermission({ actor: dto.actor });
    permission.assert({ action: OrgPermissionIdentityActions.Delete, subject: OrgPermissionSubjects.Identity });

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
      shouldUseNewPrivilegeSystem: dto.actor.org.shouldUseNewPrivilegeSystem,
      opActions: OrgPermissionIdentityActions.Delete,
      opSubject: OrgPermissionSubjects.Identity,
      actorPermission: permission.toAbility(),
      targetPermissions: targetPermissions.map((target) => ({ ...target, permission: target.permission.toAbility() })),
      baseMessage: "Failed to remove a more privileged identity from the organization"
    });
  };

  const onListIdentityGuard: TIdentityV2Factory["onListIdentityGuard"] = async (dto) => {
    const permission = await organizationsDomain.getOrgPermission({ actor: dto.actor });
    permission.assert({ action: OrgPermissionIdentityActions.Read, subject: OrgPermissionSubjects.Identity });

    return () => true;
  };

  const onGetIdentityByIdGuard: TIdentityV2Factory["onGetIdentityByIdGuard"] = async (dto) => {
    const permission = await organizationsDomain.getOrgPermission({ actor: dto.actor });
    permission.assert({ action: OrgPermissionIdentityActions.Read, subject: OrgPermissionSubjects.Identity });
  };

  return {
    onCreateIdentityGuard,
    onUpdateIdentityGuard,
    onDeleteIdentityGuard,
    onListIdentityGuard,
    onGetIdentityByIdGuard,
    getScopeField
  };
};
