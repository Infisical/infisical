import { ForbiddenError } from "@casl/ability";

import { BadRequestError, InternalServerError } from "@app/lib/errors";
import { groupBy } from "@app/lib/fn";
import { TSecretDalFactory } from "@app/services/secret/secret-dal";
import { TSecretVersionDalFactory } from "@app/services/secret/secret-version-dal";
import { TSecretFolderDalFactory } from "@app/services/secret-folder/secret-folder-dal";
import { TSecretFolderVersionDalFactory } from "@app/services/secret-folder/secret-folder-version-dal";

import { TLicenseServiceFactory } from "../license/license-service";
import { TPermissionServiceFactory } from "../permission/permission-service";
import { ProjectPermissionActions, ProjectPermissionSub } from "../permission/project-permission";
import {
  TGetSnapshotDataDTO,
  TProjectSnapshotCountDTO,
  TProjectSnapshotListDTO,
  TRollbackSnapshotDTO
} from "./secret-snapshot-types";
import { TSnapshotDalFactory } from "./snapshot-dal";
import { TSnapshotFolderDalFactory } from "./snapshot-folder-dal";
import { TSnapshotSecretDalFactory } from "./snapshot-secret-dal";
import { logger } from "@app/lib/logger";

type TSecretSnapshotServiceFactoryDep = {
  snapshotDal: TSnapshotDalFactory;
  snapshotSecretDal: TSnapshotSecretDalFactory;
  snapshotFolderDal: TSnapshotFolderDalFactory;
  secretVersionDal: Pick<TSecretVersionDalFactory, "insertMany" | "findLatestVersionByFolderId">;
  folderVersionDal: Pick<
    TSecretFolderVersionDalFactory,
    "findLatestVersionByFolderId" | "insertMany"
  >;
  secretDal: Pick<TSecretDalFactory, "delete" | "insertMany">;
  folderDal: Pick<
    TSecretFolderDalFactory,
    "findById" | "findBySecretPath" | "delete" | "insertMany"
  >;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  licenseService: Pick<TLicenseServiceFactory, "isValidLicense">;
};

export type TSecretSnapshotServiceFactory = ReturnType<typeof secretSnapshotServiceFactory>;

export const secretSnapshotServiceFactory = ({
  snapshotDal,
  folderVersionDal,
  secretVersionDal,
  snapshotSecretDal,
  snapshotFolderDal,
  folderDal,
  secretDal,
  permissionService,
  licenseService
}: TSecretSnapshotServiceFactoryDep) => {
  const projectSecretSnapshotCount = async ({
    environment,
    projectId,
    actorId,
    actor,
    path
  }: TProjectSnapshotCountDTO) => {
    const { permission } = await permissionService.getProjectPermission(actor, actorId, projectId);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Read,
      ProjectPermissionSub.SecretRollback
    );

    const folder = await folderDal.findBySecretPath(projectId, environment, path);
    if (!folder) throw new BadRequestError({ message: "Folder not found" });

    const count = await snapshotDal.countOfSnapshotsByFolderId(folder.id);
    return count;
  };

  const listSnapshots = async ({
    environment,
    projectId,
    actorId,
    actor,
    path,
    limit = 20,
    offset = 0
  }: TProjectSnapshotListDTO) => {
    const { permission } = await permissionService.getProjectPermission(actor, actorId, projectId);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Read,
      ProjectPermissionSub.SecretRollback
    );

    const folder = await folderDal.findBySecretPath(projectId, environment, path);
    if (!folder) throw new BadRequestError({ message: "Folder not found" });

    const snapshots = await snapshotDal.find(
      { folderId: folder.id },
      { limit, offset, sort: [["createdAt", "desc"]] }
    );
    return snapshots;
  };

  const getSnapshotData = async ({ actorId, actor, id }: TGetSnapshotDataDTO) => {
    const snapshot = await snapshotDal.findSecretSnapshotDataById(id);
    if (!snapshot) throw new BadRequestError({ message: "Snapshot not found" });
    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      snapshot.projectId
    );
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Read,
      ProjectPermissionSub.SecretRollback
    );
    return snapshot;
  };

  const performSnapshot = async (folderId: string) => {
    try {
      if (!licenseService.isValidLicense)
        throw new InternalServerError({ message: "Invalid license" });

      const snapshot = await snapshotDal.transaction(async (tx) => {
        const folder = await folderDal.findById(folderId, tx);
        if (!folder) throw new BadRequestError({ message: "Folder not found" });

        const secretVersions = await secretVersionDal.findLatestVersionByFolderId(folderId, tx);
        const folderVersions = await folderVersionDal.findLatestVersionByFolderId(folderId, tx);
        const newSnapshot = await snapshotDal.create(
          {
            folderId,
            envId: folder.environment.envId,
            parentFolderId: folder.parentId
          },
          tx
        );
        const snapshotSecrets = await snapshotSecretDal.insertMany(
          secretVersions.map(({ id }) => ({
            secretVersionId: id,
            envId: folder.environment.envId,
            snapshotId: newSnapshot.id
          })),
          tx
        );
        const snapshotFolders = await snapshotFolderDal.insertMany(
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

  const rollbackSnapshot = async ({ id: snapshotId, actor, actorId }: TRollbackSnapshotDTO) => {
    const snapshot = await snapshotDal.findById(snapshotId);
    if (!snapshot) throw new BadRequestError({ message: "Snapshot not found" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      snapshot.projectId
    );
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Create,
      ProjectPermissionSub.SecretRollback
    );

    const rollback = await snapshotDal.transaction(async (tx) => {
      const rollbackSnaps = await snapshotDal.findRecursivelySnapshots(snapshot.id, tx);
      // this will remove all secrets in current folder
      const deletedTopLevelSecs = await secretDal.delete({ folderId: snapshot.folderId }, tx);
      const deletedTopLevelSecsGroupById = groupBy(deletedTopLevelSecs, (item) => item.id);
      // this will remove all secrets and folders on child
      // due to sql foreign key and link list connection removing the folders removes everything below too
      const deletedFolders = await folderDal.delete({ parentId: snapshot.folderId }, tx);
      const deletedTopLevelFolders = groupBy(
        deletedFolders.filter(({ parentId }) => parentId === snapshot.folderId),
        (item) => item.id
      );
      const folders = await folderDal.insertMany(
        rollbackSnaps.flatMap(({ folderVersion, folderId }) =>
          folderVersion.map(({ name, id, latestFolderVersion }) => ({
            envId: snapshot.envId,
            id,
            version: latestFolderVersion + 1,
            name,
            parentId: folderId
          }))
        ),
        tx
      );
      const secrets = await secretDal.insertMany(
        rollbackSnaps.flatMap(({ secretVersions, folderId }) =>
          secretVersions.map(
            ({
              latestSecretVersion,
              version,
              updatedAt,
              createdAt,
              secretId,
              envId,
              id,
              ...el
            }) => ({
              ...el,
              id: secretId,
              version: latestSecretVersion + 1,
              folderId
            })
          )
        ),
        tx
      );
      const folderVersions = await folderVersionDal.insertMany(
        folders.map(({ version, name, id, envId }) => ({
          name,
          version,
          folderId: id,
          envId
        })),
        tx
      );
      const secretVersions = await secretVersionDal.insertMany(
        secrets.map(({ id, updatedAt, createdAt, ...el }) => ({ ...el, secretId: id })),
        tx
      );
      const newSnapshot = await snapshotDal.create(
        {
          folderId: snapshot.folderId,
          envId: snapshot.envId,
          parentFolderId: snapshot.parentFolderId
        },
        tx
      );
      const snapshotSecrets = await snapshotSecretDal.insertMany(
        secretVersions
          .filter(({ secretId }) => Boolean(deletedTopLevelSecsGroupById?.[secretId]))
          .map(({ id }) => ({
            secretVersionId: id,
            envId: newSnapshot.envId,
            snapshotId: newSnapshot.id
          })),
        tx
      );
      const snapshotFolders = await snapshotFolderDal.insertMany(
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
