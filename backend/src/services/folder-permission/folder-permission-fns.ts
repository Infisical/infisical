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
import { TSecretFolderDALFactory } from "../secret-folder/secret-folder-dal";
import { TFolderPermissionDALFactory } from "./folder-permission-dal";
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
  environmentSlug: string,
  secretPath: string,
  secretFolderDAL: Pick<TSecretFolderDALFactory, "findBySecretPath">
): Promise<TResolvedFolder> => {
  const folder = await secretFolderDAL.findBySecretPath(projectId, environmentSlug, secretPath);
  if (!folder) {
    throw new NotFoundError({
      message: `Folder at path '${secretPath}' not found in environment with slug '${environmentSlug}' in project with ID '${projectId}'`
    });
  }
  if (folder.isReserved) {
    throw new BadRequestError({ message: "Folder access cannot be granted on a reserved system folder." });
  }
  return { id: folder.id, path: folder.path, environmentSlug: folder.environment.slug };
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

// Access can be inherited from a group, so this cannot be a membership lookup on
// actorUserId/actorIdentityId: a group-derived actor has no such row and would be rejected despite
// holding real access to the project.
const assertTargetMembership = async (
  orgId: string,
  projectId: string,
  target: TFolderGrantActor,
  folderPermissionDAL: Pick<TFolderPermissionDALFactory, "hasProjectAccess">
) => {
  const hasAccess = await folderPermissionDAL.hasProjectAccess({
    orgId,
    projectId,
    actorId: target.actorId,
    actorType: target.actorType
  });
  if (!hasAccess) {
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

// Folder grants replace base permissions at the granted path, so for a project admin they could
// only remove privileges, which is not allowed.
const assertTargetNotProjectAdmin = async (
  orgId: string,
  projectId: string,
  target: TFolderGrantActor,
  folderPermissionDAL: Pick<TFolderPermissionDALFactory, "isProjectAdmin">
) => {
  const isAdmin = await folderPermissionDAL.isProjectAdmin({
    orgId,
    projectId,
    actorId: target.actorId,
    actorType: target.actorType
  });
  if (isAdmin) {
    throw new BadRequestError({
      message: `${targetLabel(target)} with ID '${target.actorId}' has the project admin role. Project admins already have full access to every folder, so folder access cannot be granted to them.`
    });
  }
};

// both halves of target eligibility are asserted together so a new grant write cannot pick up one
// check and miss the other
export const assertGrantTargetEligible = async (
  orgId: string,
  projectId: string,
  target: TFolderGrantActor,
  folderPermissionDAL: Pick<TFolderPermissionDALFactory, "hasProjectAccess" | "isProjectAdmin">
) => {
  await assertTargetMembership(orgId, projectId, target, folderPermissionDAL);
  await assertTargetNotProjectAdmin(orgId, projectId, target, folderPermissionDAL);
};

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
  folder: TResolvedFolder
): TFolderGrant => ({
  id: row.id,
  projectId,
  folderId: folder.id,
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
