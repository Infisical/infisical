import { ForbiddenError } from "@casl/ability";

import { TableName, TSecretTagJunctionInsert } from "@app/db/schemas";
import { BadRequestError, InternalServerError } from "@app/lib/errors";
import { groupBy } from "@app/lib/fn";
import { logger } from "@app/lib/logger";
import { TSecretDALFactory } from "@app/services/secret/secret-dal";
import { TSecretVersionDALFactory } from "@app/services/secret/secret-version-dal";
import { TSecretVersionTagDALFactory } from "@app/services/secret/secret-version-tag-dal";
import { TSecretFolderDALFactory } from "@app/services/secret-folder/secret-folder-dal";
import { TSecretFolderVersionDALFactory } from "@app/services/secret-folder/secret-folder-version-dal";
import { TSecretTagDALFactory } from "@app/services/secret-tag/secret-tag-dal";

import { TLicenseServiceFactory } from "../license/license-service";
import { TPermissionServiceFactory } from "../permission/permission-service";
import { ProjectPermissionActions, ProjectPermissionSub } from "../permission/project-permission";
import {
  TGetSnapshotDataDTO,
  TProjectSnapshotCountDTO,
  TProjectSnapshotListDTO,
  TRollbackSnapshotDTO
} from "./secret-snapshot-types";
import { TSnapshotDALFactory } from "./snapshot-dal";
import { TSnapshotFolderDALFactory } from "./snapshot-folder-dal";
import { TSnapshotSecretDALFactory } from "./snapshot-secret-dal";

type TSecretSnapshotServiceFactoryDep = {
  snapshotDAL: TSnapshotDALFactory;
  snapshotSecretDAL: TSnapshotSecretDALFactory;
  snapshotFolderDAL: TSnapshotFolderDALFactory;
  secretVersionDAL: Pick<TSecretVersionDALFactory, "insertMany" | "findLatestVersionByFolderId">;
  folderVersionDAL: Pick<TSecretFolderVersionDALFactory, "findLatestVersionByFolderId" | "insertMany">;
  secretDAL: Pick<TSecretDALFactory, "delete" | "insertMany">;
  secretTagDAL: Pick<TSecretTagDALFactory, "saveTagsToSecret">;
  secretVersionTagDAL: Pick<TSecretVersionTagDALFactory, "insertMany">;
  folderDAL: Pick<TSecretFolderDALFactory, "findById" | "findBySecretPath" | "delete" | "insertMany">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  licenseService: Pick<TLicenseServiceFactory, "isValidLicense">;
};

export type TSecretSnapshotServiceFactory = ReturnType<typeof secretSnapshotServiceFactory>;

export const secretSnapshotServiceFactory = ({
  snapshotDAL,
  folderVersionDAL,
  secretVersionDAL,
  snapshotSecretDAL,
  snapshotFolderDAL,
  folderDAL,
  secretDAL,
  permissionService,
  licenseService,
  secretTagDAL,
  secretVersionTagDAL
}: TSecretSnapshotServiceFactoryDep) => {
  const projectSecretSnapshotCount = async ({
    environment,
    projectId,
    actorId,
    actor,
    actorOrgId,
    path
  }: TProjectSnapshotCountDTO) => {
    const { permission } = await permissionService.getProjectPermission(actor, actorId, projectId, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.SecretRollback);

    const folder = await folderDAL.findBySecretPath(projectId, environment, path);
    if (!folder) throw new BadRequestError({ message: "Folder not found" });

    const count = await snapshotDAL.countOfSnapshotsByFolderId(folder.id);
    return count;
  };

  const listSnapshots = async ({
    environment,
    projectId,
    actorId,
    actor,
    actorOrgId,
    path,
    limit = 20,
    offset = 0
  }: TProjectSnapshotListDTO) => {
    const { permission } = await permissionService.getProjectPermission(actor, actorId, projectId, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.SecretRollback);

    const folder = await folderDAL.findBySecretPath(projectId, environment, path);
    if (!folder) throw new BadRequestError({ message: "Folder not found" });

    const snapshots = await snapshotDAL.find({ folderId: folder.id }, { limit, offset, sort: [["createdAt", "desc"]] });
    return snapshots;
  };

  const getSnapshotData = async ({ actorId, actor, actorOrgId, id }: TGetSnapshotDataDTO) => {
    const snapshot = await snapshotDAL.findSecretSnapshotDataById(id);
    if (!snapshot) throw new BadRequestError({ message: "Snapshot not found" });
    const { permission } = await permissionService.getProjectPermission(actor, actorId, snapshot.projectId, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.SecretRollback);
    return snapshot;
  };

  const performSnapshot = async (folderId: string) => {
    try {
      if (!licenseService.isValidLicense) throw new InternalServerError({ message: "Invalid license" });

      const snapshot = await snapshotDAL.transaction(async (tx) => {
        const folder = await folderDAL.findById(folderId, tx);
        if (!folder) throw new BadRequestError({ message: "Folder not found" });

        const secretVersions = await secretVersionDAL.findLatestVersionByFolderId(folderId, tx);
        const folderVersions = await folderVersionDAL.findLatestVersionByFolderId(folderId, tx);
        const newSnapshot = await snapshotDAL.create(
          {
            folderId,
            envId: folder.environment.envId,
            parentFolderId: folder.parentId
          },
          tx
        );
        const snapshotSecrets = await snapshotSecretDAL.insertMany(
          secretVersions.map(({ id }) => ({
            secretVersionId: id,
            envId: folder.environment.envId,
            snapshotId: newSnapshot.id
          })),
          tx
        );
        const snapshotFolders = await snapshotFolderDAL.insertMany(
          folderVersions.map(({ id }) => ({
            folderVersionId: id,
            envId: folder.environment.envId,
            snapshotId: newSnapshot.id
          })),
          tx
        );

        return { ...newSnapshot, secrets: snapshotSecrets, folder: snapshotFolders };
      });

      return snapshot;
    } catch (error) {
      // this to avoid snapshot errors
      logger.error("Failed to perform snasphot");
      logger.error(error);
    }
  };

  const rollbackSnapshot = async ({ id: snapshotId, actor, actorId, actorOrgId }: TRollbackSnapshotDTO) => {
    const snapshot = await snapshotDAL.findById(snapshotId);
    if (!snapshot) throw new BadRequestError({ message: "Snapshot not found" });

    const { permission } = await permissionService.getProjectPermission(actor, actorId, snapshot.projectId, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Create,
      ProjectPermissionSub.SecretRollback
    );

    const rollback = await snapshotDAL.transaction(async (tx) => {
      const rollbackSnaps = await snapshotDAL.findRecursivelySnapshots(snapshot.id, tx);
      // this will remove all secrets in current folder
      const deletedTopLevelSecs = await secretDAL.delete({ folderId: snapshot.folderId }, tx);
      const deletedTopLevelSecsGroupById = groupBy(deletedTopLevelSecs, (item) => item.id);
      // this will remove all secrets and folders on child
      // due to sql foreign key and link list connection removing the folders removes everything below too
      const deletedFolders = await folderDAL.delete({ parentId: snapshot.folderId }, tx);
      const deletedTopLevelFolders = groupBy(
        deletedFolders.filter(({ parentId }) => parentId === snapshot.folderId),
        (item) => item.id
      );
      const folders = await folderDAL.insertMany(
        rollbackSnaps.flatMap(({ folderVersion, folderId }) =>
          folderVersion.map(({ name, id, latestFolderVersion }) => ({
            envId: snapshot.envId,
            id,
            // this means don't bump up the version if not root folder
            // because below ones can be same version as nothing changed
            version: deletedTopLevelFolders[folderId] ? latestFolderVersion + 1 : latestFolderVersion,
            name,
            parentId: folderId
          }))
        ),
        tx
      );
      const secrets = await secretDAL.insertMany(
        rollbackSnaps.flatMap(({ secretVersions, folderId }) =>
          secretVersions.map(
            ({ latestSecretVersion, version, updatedAt, createdAt, secretId, envId, id, tags, ...el }) => ({
              ...el,
              id: secretId,
              version: deletedTopLevelSecsGroupById[secretId] ? latestSecretVersion + 1 : latestSecretVersion,
              folderId
            })
          )
        ),
        tx
      );
      const secretTagsToBeInsert: TSecretTagJunctionInsert[] = [];
      const secretVerTagToBeInsert: Record<string, string[]> = {};
      rollbackSnaps.forEach(({ secretVersions }) => {
        secretVersions.forEach((secVer) => {
          secVer.tags.forEach((tag) => {
            secretTagsToBeInsert.push({ secretsId: secVer.secretId, secret_tagsId: tag.id });
            if (!secretVerTagToBeInsert?.[secVer.secretId]) secretVerTagToBeInsert[secVer.secretId] = [];
            secretVerTagToBeInsert[secVer.secretId].push(tag.id);
          });
        });
      });
      await secretTagDAL.saveTagsToSecret(secretTagsToBeInsert, tx);
      const folderVersions = await folderVersionDAL.insertMany(
        folders.map(({ version, name, id, envId }) => ({
          name,
          version,
          folderId: id,
          envId
        })),
        tx
      );
      const secretVersions = await secretVersionDAL.insertMany(
        secrets.map(({ id, updatedAt, createdAt, ...el }) => ({ ...el, secretId: id })),
        tx
      );
      await secretVersionTagDAL.insertMany(
        secretVersions.flatMap(({ secretId, id }) =>
          secretVerTagToBeInsert?.[secretId]?.length
            ? secretVerTagToBeInsert[secretId].map((tagId) => ({
                [`${TableName.SecretTag}Id` as const]: tagId,
                [`${TableName.SecretVersion}Id` as const]: id
              }))
            : []
        ),
        tx
      );
      const newSnapshot = await snapshotDAL.create(
        {
          folderId: snapshot.folderId,
          envId: snapshot.envId,
          parentFolderId: snapshot.parentFolderId
        },
        tx
      );
      const snapshotSecrets = await snapshotSecretDAL.insertMany(
        secretVersions
          .filter(({ secretId }) => Boolean(deletedTopLevelSecsGroupById?.[secretId]))
          .map(({ id }) => ({
            secretVersionId: id,
            envId: newSnapshot.envId,
            snapshotId: newSnapshot.id
          })),
        tx
      );
      const snapshotFolders = await snapshotFolderDAL.insertMany(
        folderVersions
          .filter(({ folderId }) => Boolean(deletedTopLevelFolders?.[folderId]))
          .map(({ id }) => ({
            folderVersionId: id,
            envId: newSnapshot.envId,
            snapshotId: newSnapshot.id
          })),
        tx
      );

      return { ...newSnapshot, snapshotSecrets, snapshotFolders };
    });

    return rollback;
  };

  return {
    performSnapshot,
    projectSecretSnapshotCount,
    listSnapshots,
    getSnapshotData,
    rollbackSnapshot
  };
};
