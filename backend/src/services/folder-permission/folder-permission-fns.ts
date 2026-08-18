import { ForbiddenError, subject } from "@casl/ability";

import { ActionProjectType, SecretFolderRole, TAdditionalPrivileges, TemporaryPermissionMode } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionSecretFolderActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { ms } from "@app/lib/ms";
import { OrgServiceActor } from "@app/lib/types";

import { ActorType } from "../auth/auth-type";
import { TMembershipDALFactory } from "../membership/membership-dal";
import { TSecretFolderDALFactory } from "../secret-folder/secret-folder-dal";
import { TFolderGrant, TFolderGrantActor, TFolderGrantTypeInput, TResolvedFolder } from "./folder-permission-types";

export const computeTemporaryFields = (type: TFolderGrantTypeInput | undefined) => {
  if (!type?.isTemporary) {
    return {
      isTemporary: false,
      temporaryMode: null,
      temporaryRange: null,
      temporaryAccessStartTime: null,
      temporaryAccessEndTime: null
    };
  }

  const startTime = new Date(type.temporaryAccessStartTime);
  return {
    isTemporary: true,
    temporaryMode: TemporaryPermissionMode.Relative,
    temporaryRange: type.temporaryRange,
    temporaryAccessStartTime: startTime,
    temporaryAccessEndTime: new Date(startTime.getTime() + ms(type.temporaryRange))
  };
};

export const resolveFolder = async (
  projectId: string,
  folderId: string,
  secretFolderDAL: Pick<TSecretFolderDALFactory, "findSecretPathByFolderIds">
) => {
  const [folder] = await secretFolderDAL.findSecretPathByFolderIds(projectId, [folderId]);
  if (!folder) {
    throw new NotFoundError({
      message: `Folder with ID '${folderId}' not found in project with ID '${projectId}'`
    });
  }
  if (folder.parentId === null) {
    throw new BadRequestError({
      message: "Folder access cannot be granted on the root folder. Grant a project role instead, or pick a subfolder."
    });
  }
  if (folder.isReserved) {
    throw new BadRequestError({ message: "Folder access cannot be granted on a reserved system folder." });
  }
  return folder;
};

export const assertManageFolderAccess = async (
  permission: OrgServiceActor,
  projectId: string,
  folder: TResolvedFolder,
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">
) => {
  const { permission: callerPermission } = await permissionService.getProjectPermission({
    actor: permission.type,
    actorId: permission.id,
    projectId,
    actorAuthMethod: permission.authMethod,
    actorOrgId: permission.orgId,
    actionProjectType: ActionProjectType.SecretManager
  });
  ForbiddenError.from(callerPermission).throwUnlessCan(
    ProjectPermissionSecretFolderActions.ManageAccess,
    subject(ProjectPermissionSub.SecretFolders, {
      environment: folder.environmentSlug,
      secretPath: folder.path
    })
  );
};

export const assertTargetMembership = async (
  orgId: string,
  projectId: string,
  target: TFolderGrantActor,
  membershipDAL: Pick<TMembershipDALFactory, "findOne">
) => {
  const membership = await membershipDAL.findOne({
    scopeOrgId: orgId,
    scopeProjectId: projectId,
    [target.actorType === ActorType.USER ? "actorUserId" : "actorIdentityId"]: target.actorId
  });
  if (!membership) {
    throw new NotFoundError({
      message:
        target.actorType === ActorType.USER
          ? `User with ID '${target.actorId}' is not a member of project with ID '${projectId}'`
          : `Machine identity with ID '${target.actorId}' is not a member of project with ID '${projectId}'`
    });
  }
};

export const targetActorField = (target: TFolderGrantActor) =>
  target.actorType === ActorType.USER ? ("actorUserId" as const) : ("actorIdentityId" as const);

export const targetLabel = (target: TFolderGrantActor) =>
  target.actorType === ActorType.USER ? "User" : "Machine identity";

export const toFolderGrant = (
  row: Pick<
    TAdditionalPrivileges,
    | "id"
    | "role"
    | "isTemporary"
    | "temporaryMode"
    | "temporaryRange"
    | "temporaryAccessStartTime"
    | "temporaryAccessEndTime"
    | "createdAt"
    | "updatedAt"
  >,
  projectId: string,
  folderId: string,
  folder: TResolvedFolder
): TFolderGrant => ({
  id: row.id,
  projectId,
  folderId,
  permission: row.role as SecretFolderRole,
  environment: folder.environmentSlug,
  secretPath: folder.path,
  isTemporary: row.isTemporary,
  temporaryMode: row.temporaryMode ?? null,
  temporaryRange: row.temporaryRange ?? null,
  temporaryAccessStartTime: row.temporaryAccessStartTime ?? null,
  temporaryAccessEndTime: row.temporaryAccessEndTime ?? null,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt
});
