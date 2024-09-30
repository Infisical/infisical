import { ForbiddenError, subject } from "@casl/ability";

import { TableName, TSecretTagJunctionInsert, TSecretV2TagJunctionInsert } from "@app/db/schemas";
import { decryptSymmetric128BitHexKeyUTF8 } from "@app/lib/crypto";
import { InternalServerError, NotFoundError } from "@app/lib/errors";
import { groupBy } from "@app/lib/fn";
import { logger } from "@app/lib/logger";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { TProjectBotServiceFactory } from "@app/services/project-bot/project-bot-service";
import { TSecretDALFactory } from "@app/services/secret/secret-dal";
import { TSecretVersionDALFactory } from "@app/services/secret/secret-version-dal";
import { TSecretVersionTagDALFactory } from "@app/services/secret/secret-version-tag-dal";
import { TSecretFolderDALFactory } from "@app/services/secret-folder/secret-folder-dal";
import { TSecretFolderVersionDALFactory } from "@app/services/secret-folder/secret-folder-version-dal";
import { TSecretTagDALFactory } from "@app/services/secret-tag/secret-tag-dal";
import { TSecretV2BridgeDALFactory } from "@app/services/secret-v2-bridge/secret-v2-bridge-dal";
import { TSecretVersionV2DALFactory } from "@app/services/secret-v2-bridge/secret-version-dal";
import { TSecretVersionV2TagDALFactory } from "@app/services/secret-v2-bridge/secret-version-tag-dal";

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
import { TSnapshotSecretV2DALFactory } from "./snapshot-secret-v2-dal";
import { getFullFolderPath } from "./snapshot-service-fns";

type TSecretSnapshotServiceFactoryDep = {
  snapshotDAL: TSnapshotDALFactory;
  snapshotSecretDAL: TSnapshotSecretDALFactory;
  snapshotSecretV2BridgeDAL: TSnapshotSecretV2DALFactory;
  snapshotFolderDAL: TSnapshotFolderDALFactory;
  secretVersionDAL: Pick<TSecretVersionDALFactory, "insertMany" | "findLatestVersionByFolderId">;
  secretVersionV2BridgeDAL: Pick<TSecretVersionV2DALFactory, "insertMany" | "findLatestVersionByFolderId">;
  folderVersionDAL: Pick<TSecretFolderVersionDALFactory, "findLatestVersionByFolderId" | "insertMany">;
  secretDAL: Pick<TSecretDALFactory, "delete" | "insertMany">;
  secretV2BridgeDAL: Pick<TSecretV2BridgeDALFactory, "delete" | "insertMany">;
  secretTagDAL: Pick<TSecretTagDALFactory, "saveTagsToSecret" | "saveTagsToSecretV2">;
  secretVersionTagDAL: Pick<TSecretVersionTagDALFactory, "insertMany">;
  secretVersionV2TagBridgeDAL: Pick<TSecretVersionV2TagDALFactory, "insertMany">;
  folderDAL: Pick<TSecretFolderDALFactory, "findById" | "findBySecretPath" | "delete" | "insertMany" | "find">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  licenseService: Pick<TLicenseServiceFactory, "isValidLicense">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  projectBotService: Pick<TProjectBotServiceFactory, "getBotKey">;
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
  secretVersionTagDAL,
  secretVersionV2BridgeDAL,
  secretV2BridgeDAL,
  snapshotSecretV2BridgeDAL,
  secretVersionV2TagBridgeDAL,
  kmsService,
  projectBotService
}: TSecretSnapshotServiceFactoryDep) => {
  const projectSecretSnapshotCount = async ({
    environment,
    projectId,
    actorId,
    actor,
    actorOrgId,
    actorAuthMethod,
    path
  }: TProjectSnapshotCountDTO) => {
    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.SecretRollback);

    // We need to check if the user has access to the secrets in the folder. If we don't do this, a user could theoretically access snapshot secret values even if they don't have read access to the secrets in the folder.
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Read,
      subject(ProjectPermissionSub.Secrets, { environment, secretPath: path })
    );

    const folder = await folderDAL.findBySecretPath(projectId, environment, path);
    if (!folder) throw new NotFoundError({ message: "Folder not found" });

    return snapshotDAL.countOfSnapshotsByFolderId(folder.id);
  };

  const listSnapshots = async ({
    environment,
    projectId,
    actorId,
    actor,
    actorOrgId,
    actorAuthMethod,
    path,
    limit = 20,
    offset = 0
  }: TProjectSnapshotListDTO) => {
    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.SecretRollback);

    // We need to check if the user has access to the secrets in the folder. If we don't do this, a user could theoretically access snapshot secret values even if they don't have read access to the secrets in the folder.
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Read,
      subject(ProjectPermissionSub.Secrets, { environment, secretPath: path })
    );

    const folder = await folderDAL.findBySecretPath(projectId, environment, path);
    if (!folder) throw new NotFoundError({ message: "Folder not found" });

    const snapshots = await snapshotDAL.find({ folderId: folder.id }, { limit, offset, sort: [["createdAt", "desc"]] });
    return snapshots;
  };

  const getSnapshotData = async ({ actorId, actor, actorOrgId, actorAuthMethod, id }: TGetSnapshotDataDTO) => {
    const snapshot = await snapshotDAL.findById(id);
    if (!snapshot) throw new NotFoundError({ message: "Snapshot not found" });
    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      snapshot.projectId,
      actorAuthMethod,
      actorOrgId
    );

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.SecretRollback);
    const shouldUseBridge = snapshot.projectVersion === 3;
    let snapshotDetails;
    if (shouldUseBridge) {
      const { decryptor: secretManagerDecryptor } = await kmsService.createCipherPairWithDataKey({
        type: KmsDataKey.SecretManager,
        projectId: snapshot.projectId
      });
      const encryptedSnapshotDetails = await snapshotDAL.findSecretSnapshotV2DataById(id);
      snapshotDetails = {
        ...encryptedSnapshotDetails,
        secretVersions: encryptedSnapshotDetails.secretVersions.map((el) => ({
          ...el,
          secretKey: el.key,
          secretValue: el.encryptedValue
            ? secretManagerDecryptor({ cipherTextBlob: el.encryptedValue }).toString()
            : "",
          secretComment: el.encryptedComment
            ? secretManagerDecryptor({ cipherTextBlob: el.encryptedComment }).toString()
            : ""
        }))
      };
    } else {
      const encryptedSnapshotDetails = await snapshotDAL.findSecretSnapshotDataById(id);
      const { botKey } = await projectBotService.getBotKey(snapshot.projectId);
      if (!botKey) throw new NotFoundError({ message: "Project bot not found" });
      snapshotDetails = {
        ...encryptedSnapshotDetails,
        secretVersions: encryptedSnapshotDetails.secretVersions.map((el) => ({
          ...el,
          secretKey: decryptSymmetric128BitHexKeyUTF8({
            ciphertext: el.secretKeyCiphertext,
            iv: el.secretKeyIV,
            tag: el.secretKeyTag,
            key: botKey
          }),
          secretValue: decryptSymmetric128BitHexKeyUTF8({
            ciphertext: el.secretValueCiphertext,
            iv: el.secretValueIV,
            tag: el.secretValueTag,
            key: botKey
          }),
          secretComment:
            el.secretCommentTag && el.secretCommentIV && el.secretCommentCiphertext
              ? decryptSymmetric128BitHexKeyUTF8({
                  ciphertext: el.secretCommentCiphertext,
                  iv: el.secretCommentIV,
                  tag: el.secretCommentTag,
                  key: botKey
                })
              : ""
        }))
      };
    }

    const fullFolderPath = await getFullFolderPath({
      folderDAL,
      folderId: snapshotDetails.folderId,
      envId: snapshotDetails.environment.id
    });

    // We need to check if the user has access to the secrets in the folder. If we don't do this, a user could theoretically access snapshot secret values even if they don't have read access to the secrets in the folder.
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Read,
      subject(ProjectPermissionSub.Secrets, {
        environment: snapshotDetails.environment.slug,
        secretPath: fullFolderPath
      })
    );

    return snapshotDetails;
  };

  const performSnapshot = async (folderId: string) => {
    try {
      if (!licenseService.isValidLicense) throw new InternalServerError({ message: "Invalid license" });
      const folder = await folderDAL.findById(folderId);
      if (!folder) throw new NotFoundError({ message: "Folder not found" });
      const shouldUseSecretV2Bridge = folder.projectVersion === 3;

      if (shouldUseSecretV2Bridge) {
        const snapshot = await snapshotDAL.transaction(async (tx) => {
          const secretVersions = await secretVersionV2BridgeDAL.findLatestVersionByFolderId(folderId, tx);
          const folderVersions = await folderVersionDAL.findLatestVersionByFolderId(folderId, tx);
          const newSnapshot = await snapshotDAL.create(
            {
              folderId,
              envId: folder.environment.envId,
              parentFolderId: folder.parentId
            },
            tx
          );
          const snapshotSecrets = await snapshotSecretV2BridgeDAL.insertMany(
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
      }

      const snapshot = await snapshotDAL.transaction(async (tx) => {
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

  const rollbackSnapshot = async ({
    id: snapshotId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TRollbackSnapshotDTO) => {
    const snapshot = await snapshotDAL.findById(snapshotId);
    if (!snapshot) throw new NotFoundError({ message: "Snapshot not found" });
    const shouldUseBridge = snapshot.projectVersion === 3;

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      snapshot.projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Create,
      ProjectPermissionSub.SecretRollback
    );

    if (shouldUseBridge) {
      const rollback = await snapshotDAL.transaction(async (tx) => {
        const rollbackSnaps = await snapshotDAL.findRecursivelySnapshotsV2Bridge(snapshot.id, tx);
        // this will remove all secrets in current folder
        const deletedTopLevelSecs = await secretV2BridgeDAL.delete({ folderId: snapshot.folderId }, tx);
        const deletedTopLevelSecsGroupById = groupBy(deletedTopLevelSecs, (item) => item.id);
        // this will remove all secrets and folders on child
        // due to sql foreign key and link list connection removing the folders removes everything below too
        const deletedFolders = await folderDAL.delete({ parentId: snapshot.folderId, isReserved: false }, tx);
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
        const secrets = await secretV2BridgeDAL.insertMany(
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
        const secretTagsToBeInsert: TSecretV2TagJunctionInsert[] = [];
        const secretVerTagToBeInsert: Record<string, string[]> = {};
        rollbackSnaps.forEach(({ secretVersions }) => {
          secretVersions.forEach((secVer) => {
            secVer.tags.forEach((tag) => {
              secretTagsToBeInsert.push({ secrets_v2Id: secVer.secretId, secret_tagsId: tag.id });
              if (!secretVerTagToBeInsert?.[secVer.secretId]) secretVerTagToBeInsert[secVer.secretId] = [];
              secretVerTagToBeInsert[secVer.secretId].push(tag.id);
            });
          });
        });
        await secretTagDAL.saveTagsToSecretV2(secretTagsToBeInsert, tx);
        const folderVersions = await folderVersionDAL.insertMany(
          folders.map(({ version, name, id, envId }) => ({
            name,
            version,
            folderId: id,
            envId
          })),
          tx
        );
        const secretVersions = await secretVersionV2BridgeDAL.insertMany(
          secrets.map(({ id, updatedAt, createdAt, ...el }) => ({ ...el, secretId: id })),
          tx
        );
        await secretVersionV2TagBridgeDAL.insertMany(
          secretVersions.flatMap(({ secretId, id }) =>
            secretVerTagToBeInsert?.[secretId]?.length
              ? secretVerTagToBeInsert[secretId].map((tagId) => ({
                  [`${TableName.SecretTag}Id` as const]: tagId,
                  [`${TableName.SecretVersionV2}Id` as const]: id
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
        const snapshotSecrets = await snapshotSecretV2BridgeDAL.insertMany(
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
    }

    const rollback = await snapshotDAL.transaction(async (tx) => {
      const rollbackSnaps = await snapshotDAL.findRecursivelySnapshots(snapshot.id, tx);
      // this will remove all secrets in current folder
      const deletedTopLevelSecs = await secretDAL.delete({ folderId: snapshot.folderId }, tx);
      const deletedTopLevelSecsGroupById = groupBy(deletedTopLevelSecs, (item) => item.id);
      // this will remove all secrets and folders on child
      // due to sql foreign key and link list connection removing the folders removes everything below too
      const deletedFolders = await folderDAL.delete({ parentId: snapshot.folderId, isReserved: false }, tx);
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
