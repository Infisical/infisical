import { ForbiddenError } from "@casl/ability";

import { AccessScope, ActionProjectType } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectPermissionIdentityActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { InternalServerError } from "@app/lib/errors";
import { TMembershipIdentityDALFactory } from "@app/services/membership-identity/membership-identity-dal";

import { TIdentityScopeFactory } from "../scoped-identity-types";
import { TProjectDALFactory } from "@app/services/project/project-dal";

type TProjectScopedIdentityFactoryDep = {
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  membershipIdentityDAL: Pick<TMembershipIdentityDALFactory, "findOne" | "create">;
  projectDAL: Pick<TProjectDALFactory, "findById">;
};

export const newProjectScopedIdentityFactory = ({
  permissionService,
  membershipIdentityDAL,
  projectDAL
}: TProjectScopedIdentityFactoryDep): TIdentityScopeFactory => {
  const getScopeField: TIdentityScopeFactory["getScopeField"] = (scopeData) => {
    if (scopeData.scope === AccessScope.Project) {
      return { key: "projectId" as const, value: scopeData.projectId };
    }
    throw new InternalServerError({ message: "Invalid scope provided for the project factory" });
  };

  const onCreateIdentityGuard: TIdentityScopeFactory["onCreateIdentityGuard"] = async (dto) => {
    const scope = getScopeField(dto.scopeData);
    const { permission } = await permissionService.getProjectPermission({
      actor: dto.permission.type,
      actorId: dto.permission.id,
      actionProjectType: ActionProjectType.Any,
      actorAuthMethod: dto.permission.authMethod,
      projectId: scope.value,
      actorOrgId: dto.permission.orgId
    });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionIdentityActions.Create,
      ProjectPermissionSub.Identity
    );
  };

  const onCreateIdentityDBOperations: TIdentityScopeFactory["onCreateIdentityDBOperations"] = async (
    dto,
    identityId,
    tx
  ) => {
    const scopeData = getScopeField(dto.scopeData);
    const projectDetails = await projectDAL.findById(scopeData.value, tx);
    let namespaceMembershipId = "";
    if (projectDetails.namespaceId) {
      const namespaceMembership = await membershipIdentityDAL.create(
        {
          scope: AccessScope.Namespace,
          actorIdentityId: identityId,
          scopeOrgId: dto.permission.orgId,
          scopeNamespaceId: projectDetails?.namespaceId
        },
        tx
      );
      namespaceMembershipId = namespaceMembership.id;
    }
    const projectMembership = await membershipIdentityDAL.create(
      {
        scope: AccessScope.Project,
        actorIdentityId: identityId,
        scopeOrgId: dto.permission.orgId,
        scopeProjectId: scopeData.value
      },
      tx
    );
    return { membershipIds: [namespaceMembershipId, projectMembership.id].filter(Boolean) };
  };

  const onUpdateIdentityGuard: TIdentityScopeFactory["onUpdateIdentityGuard"] = async (dto) => {
    const scope = getScopeField(dto.scopeData);
    const { permission } = await permissionService.getProjectPermission({
      actor: dto.permission.type,
      actorId: dto.permission.id,
      actionProjectType: ActionProjectType.Any,
      actorAuthMethod: dto.permission.authMethod,
      projectId: scope.value,
      actorOrgId: dto.permission.orgId
    });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionIdentityActions.Edit,
      ProjectPermissionSub.Identity
    );
  };

  const onDeleteIdentityGuard: TIdentityScopeFactory["onDeleteIdentityGuard"] = async (dto) => {
    const scope = getScopeField(dto.scopeData);
    const { permission } = await permissionService.getProjectPermission({
      actor: dto.permission.type,
      actorId: dto.permission.id,
      actionProjectType: ActionProjectType.Any,
      actorAuthMethod: dto.permission.authMethod,
      projectId: scope.value,
      actorOrgId: dto.permission.orgId
    });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionIdentityActions.Delete,
      ProjectPermissionSub.Identity
    );
  };

  const onListIdentityGuard: TIdentityScopeFactory["onListIdentityGuard"] = async (dto) => {
    const scope = getScopeField(dto.scopeData);
    const { permission } = await permissionService.getProjectPermission({
      actor: dto.permission.type,
      actorId: dto.permission.id,
      actionProjectType: ActionProjectType.Any,
      actorAuthMethod: dto.permission.authMethod,
      projectId: scope.value,
      actorOrgId: dto.permission.orgId
    });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionIdentityActions.Read,
      ProjectPermissionSub.Identity
    );
  };

  const onGetIdentityByIdGuard: TIdentityScopeFactory["onGetIdentityByIdGuard"] = async (dto) => {
    const scope = getScopeField(dto.scopeData);
    const { permission } = await permissionService.getProjectPermission({
      actor: dto.permission.type,
      actorId: dto.permission.id,
      actionProjectType: ActionProjectType.Any,
      actorAuthMethod: dto.permission.authMethod,
      projectId: scope.value,
      actorOrgId: dto.permission.orgId
    });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionIdentityActions.Read,
      ProjectPermissionSub.Identity
    );
  };

  return {
    onCreateIdentityGuard,
    onCreateIdentityDBOperations,
    onUpdateIdentityGuard,
    onDeleteIdentityGuard,
    onListIdentityGuard,
    onGetIdentityByIdGuard,
    getScopeField
  };
};
