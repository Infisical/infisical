import { ForbiddenError } from "@casl/ability";

import { ActionProjectType, ResourceType } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ActorAuthMethod, ActorType } from "@app/services/auth/auth-type";
import { TMembershipDALFactory } from "@app/services/membership/membership-dal";

import { ResourcePermissionPamResourceActions, ResourcePermissionSub } from "../permission/resource-permission";

export type TActorContext = {
  actorId: string;
  actor: ActorType;
  actorOrgId: string;
  actorAuthMethod: ActorAuthMethod;
};

type TPermissionDep = Pick<TPermissionServiceFactory, "getResourcePermission">;
type TProjectPermissionDep = Pick<TPermissionServiceFactory, "getProjectPermission">;
type TMembershipDep = Pick<TMembershipDALFactory, "findResourceMembershipsForActor">;

export const verifyProductMembership = async (
  permissionService: TProjectPermissionDep,
  projectId: string,
  ctx: TActorContext
) => {
  const { hasRole } = await permissionService.getProjectPermission({
    actor: ctx.actor,
    actorId: ctx.actorId,
    projectId,
    actorAuthMethod: ctx.actorAuthMethod,
    actorOrgId: ctx.actorOrgId,
    actionProjectType: ActionProjectType.PAM
  });
  return { hasRole };
};

export const checkFolderPermission = async (
  permissionService: TPermissionDep,
  folderId: string,
  projectId: string,
  ctx: TActorContext
) => {
  return permissionService.getResourcePermission({
    actor: ctx.actor,
    actorId: ctx.actorId,
    projectId,
    resourceType: ResourceType.PamFolder,
    resourceId: folderId,
    actorAuthMethod: ctx.actorAuthMethod,
    actorOrgId: ctx.actorOrgId
  });
};

export const checkAccountAccess = async (
  permissionService: TPermissionDep,
  accountId: string,
  folderId: string | null | undefined,
  projectId: string,
  action: ResourcePermissionPamResourceActions,
  ctx: TActorContext
) => {
  if (folderId) {
    try {
      const { permission } = await checkFolderPermission(permissionService, folderId, projectId, ctx);
      ForbiddenError.from(permission).throwUnlessCan(action, ResourcePermissionSub.PamResource);
      return;
    } catch (err) {
      if (!(err instanceof ForbiddenError)) throw err;
    }
  }

  const { permission } = await permissionService.getResourcePermission({
    actor: ctx.actor,
    actorId: ctx.actorId,
    projectId,
    resourceType: ResourceType.PamAccount,
    resourceId: accountId,
    actorAuthMethod: ctx.actorAuthMethod,
    actorOrgId: ctx.actorOrgId
  });
  ForbiddenError.from(permission).throwUnlessCan(action, ResourcePermissionSub.PamResource);
};

export const getAccessibleResourceIds = async (
  membershipDAL: TMembershipDep,
  projectId: string,
  ctx: TActorContext
) => {
  const [folderMemberships, accountMemberships] = await Promise.all([
    membershipDAL.findResourceMembershipsForActor({
      projectId,
      resourceType: ResourceType.PamFolder,
      actorType: ctx.actor,
      actorId: ctx.actorId
    }),
    membershipDAL.findResourceMembershipsForActor({
      projectId,
      resourceType: ResourceType.PamAccount,
      actorType: ctx.actor,
      actorId: ctx.actorId
    })
  ]);

  const folderIds = folderMemberships.map((m) => m.scopeResourceId).filter((id): id is string => Boolean(id));
  const accountIds = accountMemberships.map((m) => m.scopeResourceId).filter((id): id is string => Boolean(id));

  return { folderIds, accountIds };
};
