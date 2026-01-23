/* eslint-disable @typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-unsafe-member-access,@typescript-eslint/no-unsafe-argument */
// akhilmhdh: I did this, quite strange bug with eslint. Everything do have a type stil has this error
import { ForbiddenError } from "@casl/ability";

import { ActionProjectType, TableName } from "@app/db/schemas/models";
import { TSecretTagJunctionInsert } from "@app/db/schemas/secret-tag-junction";
import { TSecretV2TagJunctionInsert } from "@app/db/schemas/secret-v2-tag-junction";
import { crypto, SymmetricKeySize } from "@app/lib/crypto/cryptography";
import { InternalServerError, NotFoundError } from "@app/lib/errors";
import { groupBy } from "@app/lib/fn";
import { logger } from "@app/lib/logger";
import { ActorType } from "@app/services/auth/auth-type";
import { CommitType, TFolderCommitServiceFactory } from "@app/services/folder-commit/folder-commit-service";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { TProjectBotServiceFactory } from "@app/services/project-bot/project-bot-service";
import { TSecretDALFactory } from "@app/services/secret/secret-dal";
import { INFISICAL_SECRET_VALUE_HIDDEN_MASK } from "@app/services/secret/secret-fns";
import { TSecretVersionDALFactory } from "@app/services/secret/secret-version-dal";
import { TSecretVersionTagDALFactory } from "@app/services/secret/secret-version-tag-dal";
import { TSecretFolderDALFactory } from "@app/services/secret-folder/secret-folder-dal";
import { TSecretFolderVersionDALFactory } from "@app/services/secret-folder/secret-folder-version-dal";
import { TSecretTagDALFactory } from "@app/services/secret-tag/secret-tag-dal";
import { TSecretV2BridgeDALFactory } from "@app/services/secret-v2-bridge/secret-v2-bridge-dal";
import { TSecretVersionV2DALFactory } from "@app/services/secret-v2-bridge/secret-version-dal";
import { TSecretVersionV2TagDALFactory } from "@app/services/secret-v2-bridge/secret-version-tag-dal";

import { TLicenseServiceFactory } from "../license/license-service";
import {
  hasSecretReadValueOrDescribePermission,
  throwIfMissingSecretReadValueOrDescribePermission
} from "../permission/permission-fns";
import { TPermissionServiceFactory } from "../permission/permission-service-types";
import {
  ProjectPermissionActions,
  ProjectPermissionSecretActions,
  ProjectPermissionSub
} from "../permission/project-permission";
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
  secretVersionV2BridgeDAL: Pick<TSecretVersionV2DALFactory, "insertMany" | "findLatestVersionByFolderId" | "findOne">;
  folderVersionDAL: Pick<TSecretFolderVersionDALFactory, "findLatestVersionByFolderId" | "insertMany" | "findOne">;
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
  folderCommitService: Pick<TFolderCommitServiceFactory, "createCommit">;
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
  projectBotService,
  folderCommitService
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
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.SecretRollback);

    // We need to check if the user has access to the secrets in the folder. If we don't do this, a user could theoretically access snapshot secret values even if they don't have read access to the secrets in the folder.
    throwIfMissingSecretReadValueOrDescribePermission(permission, ProjectPermissionSecretActions.DescribeSecret, {
      environment,
      secretPath: path
    });

    const folder = await folderDAL.findBySecretPath(projectId, environment, path);
    if (!folder) {
      throw new NotFoundError({
        message: `Folder with path '${path}' not found in environment with slug '${environment}'`
      });
    }

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
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.SecretRollback);

    // We need to check if the user has access to the secrets in the folder. If we don't do this, a user could theoretically access snapshot secret values even if they don't have read access to the secrets in the folder.
    throwIfMissingSecretReadValueOrDescribePermission(permission, ProjectPermissionSecretActions.DescribeSecret, {
      environment,
      secretPath: path
    });

    const folder = await folderDAL.findBySecretPath(projectId, environment, path);
    if (!folder)
      throw new NotFoundError({
        message: `Folder with path '${path}' not found in environment with slug '${environment}'`
      });

    const snapshots = await snapshotDAL.find({ folderId: folder.id }, { limit, offset, sort: [["createdAt", "desc"]] });
    return snapshots;
  };

  const getSnapshotData = async ({ actorId, actor, actorOrgId, actorAuthMethod, id }: TGetSnapshotDataDTO) => {
    const snapshot = await snapshotDAL.findById(id);
    if (!snapshot) throw new NotFoundError({ message: `Snapshot with ID '${id}' not found` });
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: snapshot.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.SecretRollback);

    const shouldUseBridge = snapshot.projectVersion === 3;
    let snapshotDetails;
    if (shouldUseBridge) {
      const { decryptor: secretManagerDecryptor } = await kmsService.createCipherPairWithDataKey({
        type: KmsDataKey.SecretManager,
        projectId: snapshot.projectId
      });
      const encryptedSnapshotDetails = await snapshotDAL.findSecretSnapshotV2DataById(id);

      const fullFolderPath = await getFullFolderPath({
        folderDAL,
        folderId: encryptedSnapshotDetails.folderId,
        envId: encryptedSnapshotDetails.environment.id
      });

      snapshotDetails = {
        ...encryptedSnapshotDetails,
        secretVersions: encryptedSnapshotDetails.secretVersions.map((el) => {
          const canReadValue = hasSecretReadValueOrDescribePermission(
            permission,
            ProjectPermissionSecretActions.ReadValue,
            {
              environment: encryptedSnapshotDetails.environment.slug,
              secretPath: fullFolderPath,
              secretName: el.key,
              secretTags: el.tags.length ? el.tags.map((tag) => tag.slug) : undefined
            }
          );

          let secretValue = "";
          if (canReadValue) {
            secretValue = el.encryptedValue
              ? secretManagerDecryptor({ cipherTextBlob: el.encryptedValue }).toString()
              : "";
          } else {
            secretValue = INFISICAL_SECRET_VALUE_HIDDEN_MASK;
          }

          return {
            ...el,
            secretKey: el.key,
            secretValueHidden: !canReadValue,
            secretValue,
            secretComment: el.encryptedComment
              ? secretManagerDecryptor({ cipherTextBlob: el.encryptedComment }).toString()
              : ""
          };
        })
      };
    } else {
      const encryptedSnapshotDetails = await snapshotDAL.findSecretSnapshotDataById(id);

      const fullFolderPath = await getFullFolderPath({
        folderDAL,
        folderId: encryptedSnapshotDetails.folderId,
        envId: encryptedSnapshotDetails.environment.id
      });

      const { botKey } = await projectBotService.getBotKey(snapshot.projectId);
      if (!botKey)
        throw new NotFoundError({ message: `Project bot key not found for project with ID '${snapshot.projectId}'` });

      snapshotDetails = {
        ...encryptedSnapshotDetails,
        secretVersions: encryptedSnapshotDetails.secretVersions.map((el) => {
          const secretKey = crypto.encryption().symmetric().decrypt({
            ciphertext: el.secretKeyCiphertext,
            iv: el.secretKeyIV,
            tag: el.secretKeyTag,
            key: botKey,
            keySize: SymmetricKeySize.Bits128
          });

          const canReadValue = hasSecretReadValueOrDescribePermission(
            permission,
            ProjectPermissionSecretActions.ReadValue,
            {
              environment: encryptedSnapshotDetails.environment.slug,
              secretPath: fullFolderPath,
              secretName: secretKey,
              secretTags: el.tags.length ? el.tags.map((tag) => tag.slug) : undefined
            }
          );

          let secretValue = "";

          if (canReadValue) {
            secretValue = crypto.encryption().symmetric().decrypt({
              ciphertext: el.secretValueCiphertext,
              iv: el.secretValueIV,
              tag: el.secretValueTag,
              key: botKey,
              keySize: SymmetricKeySize.Bits128
            });
          } else {
            secretValue = INFISICAL_SECRET_VALUE_HIDDEN_MASK;
          }

          return {
            ...el,
            secretKey,
            secretValueHidden: !canReadValue,
            secretValue,
            secretComment:
              el.secretCommentTag && el.secretCommentIV && el.secretCommentCiphertext
                ? crypto.encryption().symmetric().decrypt({
                    ciphertext: el.secretCommentCiphertext,
                    iv: el.secretCommentIV,
                    tag: el.secretCommentTag,
                    key: botKey,
                    keySize: SymmetricKeySize.Bits128
                  })
                : ""
          };
        })
      };
    }

    return snapshotDetails;
  };

  const performSnapshot = async (folderId: string) => {
    try {
      if (!licenseService.isValidLicense) throw new InternalServerError({ message: "Invalid license" });
      const folder = await folderDAL.findById(folderId);
      if (!folder) throw new NotFoundError({ message: `Folder with ID '${folderId}' not found` });
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

          const snapshotSecrets = await snapshotSecretV2BridgeDAL.batchInsert(
            secretVersions.map(({ id }) => ({
              secretVersionId: id,
              envId: folder.environment.envId,
              snapshotId: newSnapshot.id
            })),
            tx
          );

          const snapshotFolders = await snapshotFolderDAL.batchInsert(
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
    if (!snapshot) throw new NotFoundError({ message: `Snapshot with ID '${snapshotId}' not found` });
    const shouldUseBridge = snapshot.projectVersion === 3;

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: snapshot.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Create,
      ProjectPermissionSub.SecretRollback
    );

    if (shouldUseBridge) {
      const rollback = await snapshotDAL.transaction(async (tx) => {
        const rollbackSnaps = await snapshotDAL.findRecursivelySnapshotsV2Bridge(snapshot.id, tx);
        const secretRotationIds = rollbackSnaps
          .flatMap((snap) => snap.secretVersions)
          .filter((el) => el.isRotatedSecret)
          .map((el) => el.secretId);

        const deletedSecretsChanges = new Map(); // secretId -> version info
        const deletedFoldersChanges = new Map(); // folderId -> version info
        const addedSecretsChanges = new Map(); // secretId -> version info
        const addedFoldersChanges = new Map(); // folderId -> version info
        const commitChanges: {
          type: string;
          secretVersionId?: string;
          folderVersionId?: string;
          isUpdate?: boolean;
          folderId?: string;
        }[] = [];

        // this will remove all secrets in current folder except rotated secrets which we ignore
        const deletedTopLevelSecs = await secretV2BridgeDAL.delete(
          {
            $complex: {
              operator: "and",
              value: [
                {
                  operator: "eq",
                  field: "folderId",
                  value: snapshot.folderId
                },
                {
                  operator: "notIn",
                  field: "id",
                  value: secretRotationIds
                }
              ]
            }
          },
          tx
        );

        await Promise.all(
          deletedTopLevelSecs.map(async (sec) => {
            const version = await secretVersionV2BridgeDAL.findOne({ secretId: sec.id, version: sec.version }, tx);
            deletedSecretsChanges.set(sec.id, {
              id: sec.id,
              version: sec.version,
              // Store the version ID if available from the snapshot
              versionId: version?.id
            });
          })
        );

        const deletedTopLevelSecsGroupById = groupBy(deletedTopLevelSecs, (item) => item.id);

        const deletedFoldersData = await folderDAL.delete({ parentId: snapshot.folderId, isReserved: false }, tx);

        await Promise.all(
          deletedFoldersData.map(async (folder) => {
            const version = await folderVersionDAL.findOne({ folderId: folder.id, version: folder.version }, tx);
            deletedFoldersChanges.set(folder.id, {
              id: folder.id,
              version: folder.version,
              // Store the version ID if available
              versionId: version?.id
            });
          })
        );

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
            secretVersions
              .filter((v) => !v.isRotatedSecret)
              .map(
                ({
                  latestSecretVersion,
                  version,
                  updatedAt,
                  createdAt,
                  secretId,
                  envId,
                  id,
                  tags,
                  // exclude the bottom fields from the secret - they are for versioning only.
                  userActorId,
                  identityActorId,
                  actorType,
                  isRotatedSecret,
                  ...el
                }) => ({
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
          folders.map(({ version, name, id, envId, description }) => ({
            name,
            version,
            folderId: id,
            envId,
            description
          })),
          tx
        );

        // Track added folders
        folderVersions.forEach((fv) => {
          addedFoldersChanges.set(fv.folderId, fv);
        });

        const userActorId = actor === ActorType.USER ? actorId : undefined;
        const identityActorId = actor !== ActorType.USER ? actorId : undefined;
        const actorType = actor || ActorType.PLATFORM;

        const secretVersions = await secretVersionV2BridgeDAL.insertMany(
          secrets.map(({ id, updatedAt, createdAt, ...el }) => ({
            ...el,
            secretId: id,
            userActorId,
            identityActorId,
            actorType
          })),
          tx
        );

        secretVersions.forEach((sv) => {
          addedSecretsChanges.set(sv.secretId, sv);
        });

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

        // Compute commit changes
        // Handle secrets
        deletedSecretsChanges.forEach((deletedInfo, secretId) => {
          const addedSecret = addedSecretsChanges.get(secretId);
          if (addedSecret) {
            // Secret was deleted and re-added - this is an update only if versions are different
            if (deletedInfo.versionId !== addedSecret.id) {
              commitChanges.push({
                type: CommitType.ADD, // In the commit system, updates are tracked as "add" with isUpdate=true
                secretVersionId: addedSecret.id,
                isUpdate: true
              });
            }
            // Remove from addedSecrets since we've handled it
            addedSecretsChanges.delete(secretId);
          } else if (deletedInfo.versionId) {
            // Secret was only deleted
            commitChanges.push({
              type: CommitType.DELETE,
              secretVersionId: deletedInfo.versionId
            });
          }
        });
        // Add remaining new secrets (not updates)
        addedSecretsChanges.forEach((addedSecret) => {
          commitChanges.push({
            type: CommitType.ADD,
            secretVersionId: addedSecret.id
          });
        });

        // Handle folders
        deletedFoldersChanges.forEach((deletedInfo, folderId) => {
          const addedFolder = addedFoldersChanges.get(folderId);
          if (addedFolder) {
            // Folder was deleted and re-added - this is an update only if versions are different
            if (deletedInfo.versionId !== addedFolder.id) {
              commitChanges.push({
                type: CommitType.ADD,
                folderVersionId: addedFolder.id,
                isUpdate: true
              });
            }
            // Remove from addedFolders since we've handled it
            addedFoldersChanges.delete(folderId);
          } else if (deletedInfo.versionId) {
            // Folder was only deleted
            commitChanges.push({
              type: CommitType.DELETE,
              folderVersionId: deletedInfo.versionId,
              folderId: deletedInfo.id
            });
          }
        });

        // Add remaining new folders (not updates)
        addedFoldersChanges.forEach((addedFolder) => {
          commitChanges.push({
            type: CommitType.ADD,
            folderVersionId: addedFolder.id
          });
        });

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
        if (commitChanges.length > 0) {
          await folderCommitService.createCommit(
            {
              actor: {
                type: actorType,
                metadata: {
                  id: userActorId || identityActorId
                }
              },
              message: "Rollback to snapshot",
              folderId: snapshot.folderId,
              changes: commitChanges
            },
            tx
          );
        }

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
        folders.map(({ version, name, id, envId, description }) => ({
          name,
          version,
          folderId: id,
          envId,
          description
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
