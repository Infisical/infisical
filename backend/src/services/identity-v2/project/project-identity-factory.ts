import { AccessScope } from "@app/db/schemas";
import { assertRoleSetBoundary } from "@app/domains/platform/access-control/ce/module";
import {
  ProjectPermissionIdentityActions,
  ProjectPermissionSub,
  TProjectsDomain
} from "@app/domains/platform/projects/ce/module";
import { InternalServerError } from "@app/lib/errors";
import { TMembershipIdentityDALFactory } from "@app/services/membership-identity/membership-identity-dal";
import { resolveMembershipRoleSlugs } from "@app/services/membership/membership-fns";

import { TIdentityV2Factory } from "../identity-types";

type TProjectIdentityFactoryDep = {
  projectsDomain: Pick<TProjectsDomain, "getProjectPermission" | "getProjectPermissionByRoles">;
  membershipIdentityDAL: Pick<TMembershipIdentityDALFactory, "getIdentityById">;
};

export const newProjectIdentityFactory = ({
  projectsDomain,
  membershipIdentityDAL
}: TProjectIdentityFactoryDep): TIdentityV2Factory => {
  const getScopeField: TIdentityV2Factory["getScopeField"] = (scopeData) => {
    if (scopeData.scope === AccessScope.Project) {
      return { key: "projectId" as const, value: scopeData.projectId };
    }
    throw new InternalServerError({ message: "Invalid scope provided for the project factory" });
  };

  const onCreateIdentityGuard: TIdentityV2Factory["onCreateIdentityGuard"] = async (dto) => {
    const scope = getScopeField(dto.scopeData);
    const permission = await projectsDomain.getProjectPermission({ actor: dto.actor, projectId: scope.value });
    permission.assert({ action: ProjectPermissionIdentityActions.Create, subject: ProjectPermissionSub.Identity });
  };

  const onUpdateIdentityGuard: TIdentityV2Factory["onUpdateIdentityGuard"] = async (dto) => {
    const scope = getScopeField(dto.scopeData);
    const permission = await projectsDomain.getProjectPermission({ actor: dto.actor, projectId: scope.value });
    permission.assert({
      action: ProjectPermissionIdentityActions.Edit,
      subject: ProjectPermissionSub.Identity,
      fields: { identityId: dto.selector.identityId }
    });
  };

  const onDeleteIdentityGuard: TIdentityV2Factory["onDeleteIdentityGuard"] = async (dto) => {
    const scope = getScopeField(dto.scopeData);
    const permission = await projectsDomain.getProjectPermission({ actor: dto.actor, projectId: scope.value });
    permission.assert({
      action: ProjectPermissionIdentityActions.Delete,
      subject: ProjectPermissionSub.Identity,
      fields: { identityId: dto.selector.identityId }
    });

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
      shouldUseNewPrivilegeSystem: dto.actor.org.shouldUseNewPrivilegeSystem,
      opActions: ProjectPermissionIdentityActions.Delete,
      opSubject: ProjectPermissionSub.Identity,
      actorPermission: permission.toAbility(),
      targetPermissions: targetPermissions.map((target) => ({ ...target, permission: target.permission.toAbility() })),
      baseMessage: "Failed to remove a more privileged identity from the project",
      subjectFields: { identityId: dto.selector.identityId }
    });
  };

  const onListIdentityGuard: TIdentityV2Factory["onListIdentityGuard"] = async (dto) => {
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

  const onGetIdentityByIdGuard: TIdentityV2Factory["onGetIdentityByIdGuard"] = async (dto) => {
    const scope = getScopeField(dto.scopeData);
    const permission = await projectsDomain.getProjectPermission({ actor: dto.actor, projectId: scope.value });
    permission.assert({
      action: ProjectPermissionIdentityActions.Read,
      subject: ProjectPermissionSub.Identity,
      fields: { identityId: dto.selector.identityId }
    });
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
