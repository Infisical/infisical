import { ForbiddenError } from "@casl/ability";

import { AccessScope } from "@app/db/schemas";
import { OrgPermissionActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { InternalServerError } from "@app/lib/errors";
import { isCustomOrgRole } from "@app/services/org/org-role-fns";

import { TMembershipUserScopeFactory } from "../membership-user-types";

type TOrgMembershipUserScopeFactoryDep = {
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
};

export const newOrgMembershipUserFactory = ({
  permissionService
}: TOrgMembershipUserScopeFactoryDep): TMembershipUserScopeFactory => {
  const getScopeField: TMembershipUserScopeFactory["getScopeField"] = (dto) => {
    if (dto.scope === AccessScope.Organization) {
      return { key: "orgId" as const, value: dto.orgId };
    }
    throw new InternalServerError({ message: "Invalid scope provided for the org factory" });
  };

  const getScopeDatabaseFields: TMembershipUserScopeFactory["getScopeDatabaseFields"] = (dto) => {
    if (dto.scope === AccessScope.Organization) {
      return { scopeOrgId: dto.orgId };
    }
    throw new InternalServerError({ message: "Invalid scope provided for the org factory" });
  };

  const isCustomRole: TMembershipUserScopeFactory["isCustomRole"] = (role: string) => isCustomOrgRole(role);

  const onCreateMembershipUserGuard: TMembershipUserScopeFactory["onCreateMembershipUserGuard"] = async (dto) => {
    const { permission } = await permissionService.getOrgPermission(
      dto.permission.type,
      dto.permission.id,
      dto.permission.orgId,
      dto.permission.authMethod,
      dto.permission.orgId
    );
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Create, OrgPermissionSubjects.Member);
  };

  const onCreateMembershipComplete: TMembershipUserScopeFactory["onCreateMembershipComplete"] = async () => {
    // TODO(simp): fix this
    throw new InternalServerError({ message: "Org membership user create complete not implemented" });
  };

  const onUpdateMembershipUserGuard: TMembershipUserScopeFactory["onUpdateMembershipUserGuard"] = async (dto) => {
    const { permission } = await permissionService.getOrgPermission(
      dto.permission.type,
      dto.permission.id,
      dto.permission.orgId,
      dto.permission.authMethod,
      dto.permission.orgId
    );
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Edit, OrgPermissionSubjects.Member);
  };

  const onDeleteMembershipUserGuard: TMembershipUserScopeFactory["onDeleteMembershipUserGuard"] = async (dto) => {
    const { permission } = await permissionService.getOrgPermission(
      dto.permission.type,
      dto.permission.id,
      dto.permission.orgId,
      dto.permission.authMethod,
      dto.permission.orgId
    );
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Delete, OrgPermissionSubjects.Member);
    return { actorIdOfDeletor: dto.permission.id };
  };

  const onListMembershipUserGuard: TMembershipUserScopeFactory["onListMembershipUserGuard"] = async (dto) => {
    const { permission } = await permissionService.getOrgPermission(
      dto.permission.type,
      dto.permission.id,
      dto.permission.orgId,
      dto.permission.authMethod,
      dto.permission.orgId
    );
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Member);
  };

  const onGetMembershipUserByUserIdGuard: TMembershipUserScopeFactory["onGetMembershipUserByUserIdGuard"] = async (
    dto
  ) => {
    const { permission } = await permissionService.getOrgPermission(
      dto.permission.type,
      dto.permission.id,
      dto.permission.orgId,
      dto.permission.authMethod,
      dto.permission.orgId
    );
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Member);
  };

  return {
    onCreateMembershipUserGuard,
    onCreateMembershipComplete,
    onUpdateMembershipUserGuard,
    onDeleteMembershipUserGuard,
    onListMembershipUserGuard,
    onGetMembershipUserByUserIdGuard,
    getScopeField,
    getScopeDatabaseFields,
    isCustomRole
  };
};
