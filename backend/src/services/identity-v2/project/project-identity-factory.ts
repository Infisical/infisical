import { AccessScope } from "@app/db/schemas";
import {
  ProjectPermissionIdentityActions,
  ProjectPermissionSub,
  TProjectPermissionService
} from "@app/domains/platform/projects/ce/module";
import { InternalServerError } from "@app/lib/errors";
import { TMembershipIdentityDALFactory } from "@app/services/membership-identity/membership-identity-dal";
import { resolveMembershipRoleSlugs, toBoundsTargets } from "@app/services/membership/membership-fns";

import { TIdentityV2Factory } from "../identity-types";

type TProjectIdentityFactoryDep = {
  projectPermissionService: TProjectPermissionService;
  membershipIdentityDAL: Pick<TMembershipIdentityDALFactory, "getIdentityById">;
};

export const newProjectIdentityFactory = ({
  projectPermissionService,
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
    const permission = await projectPermissionService.getProjectPermission({
      actor: dto.actor,
      projectId: scope.value
    });
    permission.assert({ action: ProjectPermissionIdentityActions.Create, subject: ProjectPermissionSub.Identity });
  };

  const onUpdateIdentityGuard: TIdentityV2Factory["onUpdateIdentityGuard"] = async (dto) => {
    const scope = getScopeField(dto.scopeData);
    const permission = await projectPermissionService.getProjectPermission({
      actor: dto.actor,
      projectId: scope.value
    });
    permission.assert({
      action: ProjectPermissionIdentityActions.Edit,
      subject: ProjectPermissionSub.Identity,
      fields: { identityId: dto.selector.identityId }
    });
  };

  const onDeleteIdentityGuard: TIdentityV2Factory["onDeleteIdentityGuard"] = async (dto) => {
    const scope = getScopeField(dto.scopeData);
    const permission = await projectPermissionService.getProjectPermission({
      actor: dto.actor,
      projectId: scope.value
    });
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
    const targetPermissions = await projectPermissionService.getProjectPermissionByRoles({
      projectId: scope.value,
      roles: targetRoles,
      ignoreUnresolvedRoles: true
    });

    permission.assertBounds({
      usesNewPrivilegeSystem: dto.actor.org.shouldUseNewPrivilegeSystem,
      actions: ProjectPermissionIdentityActions.Delete,
      subject: ProjectPermissionSub.Identity,
      fields: { identityId: dto.selector.identityId },
      targets: toBoundsTargets(targetPermissions),
      message: "Failed to remove a more privileged identity from the project"
    });
  };

  const onListIdentityGuard: TIdentityV2Factory["onListIdentityGuard"] = async (dto) => {
    const scope = getScopeField(dto.scopeData);
    const permission = await projectPermissionService.getProjectPermission({
      actor: dto.actor,
      projectId: scope.value
    });
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
    const permission = await projectPermissionService.getProjectPermission({
      actor: dto.actor,
      projectId: scope.value
    });
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
