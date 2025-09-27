import { ForbiddenError } from "@casl/ability";

import { AccessScope, ActionProjectType, MembershipActors } from "@app/db/schemas";
import {
  constructPermissionErrorMessage,
  validatePrivilegeChangeOperation
} from "@app/ee/services/permission/permission-fns";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionIdentityActions,
  ProjectPermissionMemberActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { BadRequestError, InternalServerError, PermissionBoundaryError } from "@app/lib/errors";
import { OrgServiceActor } from "@app/lib/types";
import { ActorType } from "@app/services/auth/auth-type";
import { TMembershipDALFactory } from "@app/services/membership/membership-dal";
import { TOrgDALFactory } from "@app/services/org/org-dal";

import { TAdditionalPrivilegesScopeFactory } from "../additional-privilege-types";

type TProjectAdditionalPrivilegesScopeFactoryDep = {
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  orgDAL: Pick<TOrgDALFactory, "findById">;
  membershipDAL: Pick<TMembershipDALFactory, "findOne">;
};

export const newProjectAdditionalPrivilegesFactory = ({
  permissionService,
  orgDAL,
  membershipDAL
}: TProjectAdditionalPrivilegesScopeFactoryDep): TAdditionalPrivilegesScopeFactory => {
  const $getPermission = (permission: OrgServiceActor, projectId: string) => {
    return permissionService.getProjectPermission({
      actor: permission.type,
      actorId: permission.id,
      actionProjectType: ActionProjectType.Any,
      actorAuthMethod: permission.authMethod,
      projectId,
      actorOrgId: permission.orgId
    });
  };

  const $getActorType = (type: MembershipActors) => {
    if (type === MembershipActors.Group)
      throw new InternalServerError({ message: "Group additional privilege not implemented for projects" });

    if (type === MembershipActors.Identity) return ActorType.IDENTITY;
    if (type === MembershipActors.User) return ActorType.USER;

    throw new InternalServerError({ message: `Group additional privilege not implemented for actor: ${String(type)}` });
  };

  const getScopeField: TAdditionalPrivilegesScopeFactory["getScopeField"] = (dto) => {
    if (dto.scope === AccessScope.Project) {
      return { key: "projectId" as const, value: dto.projectId };
    }
    throw new BadRequestError({ message: "Invalid scope provided for the factory" });
  };

  const onCreateAdditionalPrivilegesGuard: TAdditionalPrivilegesScopeFactory["onCreateAdditionalPrivilegesGuard"] =
    async (dto) => {
      const scope = getScopeField(dto.scopeData);
      const actorType = $getActorType(dto.data.actorType);

      const { permission } = await $getPermission(dto.permission, scope.value);
      ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionMemberActions.Edit, ProjectPermissionSub.Member);

      const { shouldUseNewPrivilegeSystem } = await orgDAL.findById(dto.permission.orgId);
      const { permission: targetUserPermission, memberships } = await $getPermission(
        { ...dto.permission, type: actorType, id: dto.data.actorId },
        scope.value
      );

      const permissionAction =
        actorType === ActorType.USER
          ? ProjectPermissionMemberActions.GrantPrivileges
          : ProjectPermissionIdentityActions.GrantPrivileges;
      const permissionSubject =
        actorType === ActorType.USER ? ProjectPermissionSub.Member : ProjectPermissionSub.Identity;
      const permissionBoundary = validatePrivilegeChangeOperation(
        shouldUseNewPrivilegeSystem,
        permissionAction,
        permissionSubject,
        permission,
        targetUserPermission
      );
      if (!permissionBoundary.isValid)
        throw new PermissionBoundaryError({
          message: constructPermissionErrorMessage(
            "Failed to update more privileged actor",
            shouldUseNewPrivilegeSystem,
            permissionAction,
            permissionSubject
          ),
          details: { missingPermissions: permissionBoundary.missingPermissions }
        });

      const membership = memberships.find(
        (el) => el[actorType === ActorType.IDENTITY ? "actorIdentityId" : "actorUserId"] === dto.data.actorId
      );
      if (!membership) throw new BadRequestError({ message: "Actor doesn't have membership" });
      return { membershipId: membership.id };
    };

  const onUpdateAdditionalPrivilegesGuard: TAdditionalPrivilegesScopeFactory["onUpdateAdditionalPrivilegesGuard"] =
    async (dto) => {
      const scope = getScopeField(dto.scopeData);
      const actorType = $getActorType(dto.selector.actorType);

      const { permission } = await $getPermission(dto.permission, scope.value);
      ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionMemberActions.Edit, ProjectPermissionSub.Member);

      const { shouldUseNewPrivilegeSystem } = await orgDAL.findById(dto.permission.orgId);
      const { permission: targetUserPermission, memberships } = await $getPermission(
        { ...dto.permission, type: actorType, id: dto.selector.actorId },
        scope.value
      );

      const permissionAction =
        actorType === ActorType.USER
          ? ProjectPermissionMemberActions.GrantPrivileges
          : ProjectPermissionIdentityActions.GrantPrivileges;
      const permissionSubject =
        actorType === ActorType.USER ? ProjectPermissionSub.Member : ProjectPermissionSub.Identity;
      const permissionBoundary = validatePrivilegeChangeOperation(
        shouldUseNewPrivilegeSystem,
        permissionAction,
        permissionSubject,
        permission,
        targetUserPermission
      );
      if (!permissionBoundary.isValid)
        throw new PermissionBoundaryError({
          message: constructPermissionErrorMessage(
            "Failed to update more privileged actor",
            shouldUseNewPrivilegeSystem,
            permissionAction,
            permissionSubject
          ),
          details: { missingPermissions: permissionBoundary.missingPermissions }
        });

      const membership = memberships.find(
        (el) => el[actorType === ActorType.IDENTITY ? "actorIdentityId" : "actorUserId"] === dto.selector.actorId
      );
      if (!membership) throw new BadRequestError({ message: "Actor doesn't have membership" });
      return { membershipId: membership.id };
    };

  const onDeleteAdditionalPrivilegesGuard: TAdditionalPrivilegesScopeFactory["onDeleteAdditionalPrivilegesGuard"] =
    async (dto) => {
      const scope = getScopeField(dto.scopeData);
      const actorType = $getActorType(dto.selector.actorType);

      const { permission } = await $getPermission(dto.permission, scope.value);
      ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionMemberActions.Edit, ProjectPermissionSub.Member);

      const membership = await membershipDAL.findOne({
        scopeOrgId: dto.permission.orgId,
        scopeProjectId: scope.value,
        [actorType === ActorType.USER ? "actorUserId" : "actorIdentityId"]: dto.selector.actorId
      });

      if (!membership) throw new BadRequestError({ message: "Actor doesn't have membership" });
      return { membershipId: membership.id };
    };

  const onListAdditionalPrivilegesGuard: TAdditionalPrivilegesScopeFactory["onListAdditionalPrivilegesGuard"] = async (
    dto
  ) => {
    const scope = getScopeField(dto.scopeData);
    const actorType = $getActorType(dto.selector.actorType);

    const permissionSet =
      actorType === ActorType.USER
        ? ([ProjectPermissionMemberActions.Read, ProjectPermissionSub.Member] as const)
        : ([ProjectPermissionIdentityActions.Read, ProjectPermissionSub.Identity] as const);
    const { permission } = await $getPermission(dto.permission, scope.value);
    ForbiddenError.from(permission).throwUnlessCan(...permissionSet);

    const membership = await membershipDAL.findOne({
      scopeOrgId: dto.permission.orgId,
      scopeProjectId: scope.value,
      [actorType === ActorType.USER ? "actorUserId" : "actorIdentityId"]: dto.selector.actorId
    });

    if (!membership) throw new BadRequestError({ message: "Actor doesn't have membership" });
    return { membershipId: membership.id };
  };

  const onGetAdditionalPrivilegesByIdGuard: TAdditionalPrivilegesScopeFactory["onGetAdditionalPrivilegesByIdGuard"] =
    async (dto) => {
      const scope = getScopeField(dto.scopeData);
      const actorType = $getActorType(dto.selector.actorType);

      const permissionSet =
        actorType === ActorType.USER
          ? ([ProjectPermissionMemberActions.Read, ProjectPermissionSub.Member] as const)
          : ([ProjectPermissionIdentityActions.Read, ProjectPermissionSub.Identity] as const);
      const { permission } = await $getPermission(dto.permission, scope.value);
      ForbiddenError.from(permission).throwUnlessCan(...permissionSet);

      const membership = await membershipDAL.findOne({
        scopeOrgId: dto.permission.orgId,
        scopeProjectId: scope.value,
        [actorType === ActorType.USER ? "actorUserId" : "actorIdentityId"]: dto.selector.actorId
      });

      if (!membership) throw new BadRequestError({ message: "Actor doesn't have membership" });
      return { membershipId: membership.id };
    };

  return {
    onCreateAdditionalPrivilegesGuard,
    onUpdateAdditionalPrivilegesGuard,
    onDeleteAdditionalPrivilegesGuard,
    onListAdditionalPrivilegesGuard,
    onGetAdditionalPrivilegesByIdGuard,
    getScopeField
  };
};
