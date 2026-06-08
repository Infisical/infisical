/* eslint-disable @typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-unsafe-member-access,@typescript-eslint/no-unsafe-argument */
// akhilmhdh: I did this, quite strange bug with eslint. Everything do have a type still has this error
import { ForbiddenError, subject } from "@casl/ability";

import { ActionProjectType } from "@app/db/schemas";
import { crypto, SymmetricKeySize } from "@app/lib/crypto/cryptography";
import { InternalServerError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { TFolderCommitServiceFactory } from "@app/services/folder-commit/folder-commit-service";
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
  ProjectPermissionCommitsActions,
  ProjectPermissionSecretActions,
  ProjectPermissionSub
} from "../permission/project-permission";
import { TGetSnapshotDataDTO, TProjectSnapshotCountDTO, TProjectSnapshotListDTO } from "./secret-snapshot-types";
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
  permissionService,
  licenseService,
  secretVersionV2BridgeDAL,
  snapshotSecretV2BridgeDAL,
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
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionCommitsActions.Read,
      subject(ProjectPermissionSub.Commits, {
        secretPath: path,
        environment
      })
    );

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
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionCommitsActions.Read,
      subject(ProjectPermissionSub.Commits, {
        secretPath: path,
        environment
      })
    );

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

      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionCommitsActions.Read,
        subject(ProjectPermissionSub.Commits, {
          secretPath: fullFolderPath,
          environment: encryptedSnapshotDetails.environment.slug
        })
      );

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

      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionCommitsActions.Read,
        subject(ProjectPermissionSub.Commits, {
          secretPath: fullFolderPath,
          environment: encryptedSnapshotDetails.environment.slug
        })
      );

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

  return {
    performSnapshot,
    projectSecretSnapshotCount,
    listSnapshots,
    getSnapshotData
  };
};
