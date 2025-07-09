import { ForbiddenError, MongoAbility, subject } from "@casl/ability";
import { Knex } from "knex";
import { z } from "zod";

import { ProjectMembershipRole, SecretsV2Schema, SecretType, TableName, TSecretsV2 } from "@app/db/schemas";
import {
  hasSecretReadValueOrDescribePermission,
  throwIfMissingSecretReadValueOrDescribePermission
} from "@app/ee/services/permission/permission-fns";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionActions,
  ProjectPermissionCommitsActions,
  ProjectPermissionSecretActions,
  ProjectPermissionSet,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { TSecretApprovalPolicyServiceFactory } from "@app/ee/services/secret-approval-policy/secret-approval-policy-service";
import { TSecretApprovalRequestDALFactory } from "@app/ee/services/secret-approval-request/secret-approval-request-dal";
import { TSecretApprovalRequestSecretDALFactory } from "@app/ee/services/secret-approval-request/secret-approval-request-secret-dal";
import { TSecretSnapshotServiceFactory } from "@app/ee/services/secret-snapshot/secret-snapshot-service";
import { TKeyStoreFactory } from "@app/keystore/keystore";
import { DatabaseErrorCode } from "@app/lib/error-codes";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { diff, groupBy } from "@app/lib/fn";
import { setKnexStringValue } from "@app/lib/knex";
import { logger } from "@app/lib/logger";
import { alphaNumericNanoId } from "@app/lib/nanoid";

import { ActorType } from "../auth/auth-type";
import { TFolderCommitServiceFactory } from "../folder-commit/folder-commit-service";
import { TKmsServiceFactory } from "../kms/kms-service";
import { KmsDataKey } from "../kms/kms-types";
import { TProjectEnvDALFactory } from "../project-env/project-env-dal";
import { TResourceMetadataDALFactory } from "../resource-metadata/resource-metadata-dal";
import { TSecretQueueFactory } from "../secret/secret-queue";
import { TGetASecretByIdDTO } from "../secret/secret-types";
import { TSecretFolderDALFactory } from "../secret-folder/secret-folder-dal";
import { TSecretImportDALFactory } from "../secret-import/secret-import-dal";
import { fnSecretsV2FromImports } from "../secret-import/secret-import-fns";
import { TSecretTagDALFactory } from "../secret-tag/secret-tag-dal";
import {
  MAX_SECRET_CACHE_BYTES,
  SECRET_DAL_TTL,
  SecretServiceCacheKeys,
  TSecretV2BridgeDALFactory
} from "./secret-v2-bridge-dal";
import {
  buildHierarchy,
  expandSecretReferencesFactory,
  fnSecretBulkDelete,
  fnSecretBulkInsert,
  fnSecretBulkUpdate,
  generatePaths,
  getAllSecretReferences,
  recursivelyGetSecretPaths,
  reshapeBridgeSecret
} from "./secret-v2-bridge-fns";
import {
  SecretOperations,
  SecretUpdateMode,
  TBackFillSecretReferencesDTO,
  TCreateManySecretDTO,
  TCreateSecretDTO,
  TDeleteManySecretDTO,
  TDeleteSecretDTO,
  TGetAccessibleSecretsDTO,
  TGetASecretDTO,
  TGetSecretReferencesTreeDTO,
  TGetSecretsDTO,
  TGetSecretsRawByFolderMappingsDTO,
  TGetSecretVersionsDTO,
  TMoveSecretsDTO,
  TSecretReference,
  TUpdateManySecretDTO,
  TUpdateSecretDTO
} from "./secret-v2-bridge-types";
import { TSecretVersionV2DALFactory } from "./secret-version-dal";
import { TSecretVersionV2TagDALFactory } from "./secret-version-tag-dal";

type TSecretV2BridgeServiceFactoryDep = {
  secretDAL: TSecretV2BridgeDALFactory;
  secretVersionDAL: TSecretVersionV2DALFactory;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  secretVersionTagDAL: Pick<TSecretVersionV2TagDALFactory, "insertMany">;
  secretTagDAL: TSecretTagDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  folderCommitService: Pick<TFolderCommitServiceFactory, "createCommit">;
  projectEnvDAL: Pick<TProjectEnvDALFactory, "findOne" | "findBySlugs">;
  folderDAL: Pick<
    TSecretFolderDALFactory,
    | "findBySecretPath"
    | "updateById"
    | "findById"
    | "findByManySecretPath"
    | "find"
    | "findBySecretPathMultiEnv"
    | "findSecretPathByFolderIds"
  >;
  secretImportDAL: Pick<TSecretImportDALFactory, "find" | "findByFolderIds">;
  secretQueueService: Pick<TSecretQueueFactory, "syncSecrets" | "handleSecretReminder" | "removeSecretReminder">;
  secretApprovalPolicyService: Pick<TSecretApprovalPolicyServiceFactory, "getSecretApprovalPolicy">;
  secretApprovalRequestDAL: Pick<TSecretApprovalRequestDALFactory, "create" | "transaction">;
  secretApprovalRequestSecretDAL: Pick<
    TSecretApprovalRequestSecretDALFactory,
    "insertV2Bridge" | "insertApprovalSecretV2Tags"
  >;
  snapshotService: Pick<TSecretSnapshotServiceFactory, "performSnapshot">;
  resourceMetadataDAL: Pick<TResourceMetadataDALFactory, "insertMany" | "delete">;
  keyStore: Pick<TKeyStoreFactory, "getItem" | "setExpiry" | "setItemWithExpiry" | "deleteItem">;
};

export type TSecretV2BridgeServiceFactory = ReturnType<typeof secretV2BridgeServiceFactory>;

/*
 * This service is a bridge from our old architecture towards the new architecture
 */
export const secretV2BridgeServiceFactory = ({
  secretDAL,
  projectEnvDAL,
  secretTagDAL,
  secretVersionDAL,
  folderCommitService,
  folderDAL,
  permissionService,
  snapshotService,
  secretQueueService,
  secretImportDAL,
  secretVersionTagDAL,
  secretApprovalPolicyService,
  secretApprovalRequestDAL,
  secretApprovalRequestSecretDAL,
  kmsService,
  resourceMetadataDAL,
  keyStore
}: TSecretV2BridgeServiceFactoryDep) => {
  const $validateSecretReferences = async (
    projectId: string,
    permission: MongoAbility<ProjectPermissionSet>,
    references: ReturnType<typeof getAllSecretReferences>["nestedReferences"],
    tx?: Knex
  ) => {
    if (!references.length) return;

    const uniqueReferenceEnvironmentSlugs = Array.from(new Set(references.map((el) => el.environment)));
    const referencesEnvironments = await projectEnvDAL.findBySlugs(projectId, uniqueReferenceEnvironmentSlugs, tx);

    if (referencesEnvironments.length !== uniqueReferenceEnvironmentSlugs.length)
      throw new BadRequestError({
        message: `Referenced environment not found. Missing ${diff(
          uniqueReferenceEnvironmentSlugs,
          referencesEnvironments.map((el) => el.slug)
        ).join(",")}`
      });

    const referencesEnvironmentGroupBySlug = groupBy(referencesEnvironments, (i) => i.slug);
    const referredFolders = await folderDAL.findByManySecretPath(
      references.map((el) => ({
        secretPath: el.secretPath,
        envId: referencesEnvironmentGroupBySlug[el.environment][0].id
      })),
      tx
    );

    const referencesFolderGroupByPath = groupBy(referredFolders.filter(Boolean), (i) => `${i?.envId}-${i?.path}`);
    const referredSecrets = await secretDAL.find(
      {
        $complex: {
          operator: "or",
          value: references.map((el) => {
            const folderId =
              referencesFolderGroupByPath[
                `${referencesEnvironmentGroupBySlug[el.environment][0].id}-${el.secretPath}`
              ][0]?.id;
            if (!folderId) throw new BadRequestError({ message: `Referenced path ${el.secretPath} doesn't exist` });

            return {
              operator: "and",
              value: [
                {
                  operator: "eq",
                  field: "folderId",
                  value: folderId
                },
                {
                  operator: "eq",
                  field: `${TableName.SecretV2}.key` as "key",
                  value: el.secretKey
                }
              ]
            };
          })
        }
      },
      { tx }
    );

    if (
      referredSecrets.length !==
      new Set(references.map(({ secretKey, secretPath, environment }) => `${secretKey}.${secretPath}.${environment}`))
        .size // only count unique references
    )
      throw new BadRequestError({
        message: `Referenced secret(s) not found: ${diff(
          references.map((el) => el.secretKey),
          referredSecrets.map((el) => el.key)
        ).join(",")}`
      });

    const referredSecretsGroupBySecretKey = groupBy(referredSecrets, (i) => i.key);
    references.forEach((el) => {
      throwIfMissingSecretReadValueOrDescribePermission(permission, ProjectPermissionSecretActions.DescribeSecret, {
        environment: el.environment,
        secretPath: el.secretPath,
        secretName: el.secretKey,
        secretTags: referredSecretsGroupBySecretKey[el.secretKey][0]?.tags?.map((i) => i.slug)
      });
    });

    return referredSecrets;
  };

  const createSecret = async ({
    actor,
    actorId,
    actorOrgId,
    environment,
    actorAuthMethod,
    projectId,
    secretPath,
    secretMetadata,
    ...inputSecret
  }: TCreateSecretDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    });

    const folder = await folderDAL.findBySecretPath(projectId, environment, secretPath);
    if (!folder)
      throw new NotFoundError({
        message: `Folder with path '${secretPath}' in environment with slug '${environment}' not found`,
        name: "CreateSecret"
      });
    const folderId = folder.id;

    if (ActorType.USER !== actor && inputSecret.type === SecretType.Personal) {
      throw new BadRequestError({ message: "Must be user to create personal secret" });
    }

    const doesSecretExist = await secretDAL.findOne({
      key: inputSecret.secretName,
      type: SecretType.Shared,
      folderId
    });
    if (inputSecret.type === SecretType.Shared && doesSecretExist)
      throw new BadRequestError({ message: "Secret already exist" });

    // if user creating personal check its shared also exist
    if (inputSecret.type === SecretType.Personal && !doesSecretExist) {
      throw new BadRequestError({
        message: "Failed to create personal secret override for no corresponding shared secret"
      });
    }

    // validate tags
    // fetch all tags and if not same count throw error meaning one was invalid tags
    const tags = inputSecret.tagIds ? await secretTagDAL.find({ projectId, $in: { id: inputSecret.tagIds } }) : [];
    if ((inputSecret.tagIds || []).length !== tags.length)
      throw new NotFoundError({ message: `Tag not found. Found ${tags.map((el) => el.slug).join(",")}` });

    const { secretName, type, ...inputSecretData } = inputSecret;

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionSecretActions.Create,
      subject(ProjectPermissionSub.Secrets, {
        environment,
        secretPath,
        secretName,
        secretTags: tags?.map((el) => el.slug)
      })
    );

    const { nestedReferences, localReferences } = getAllSecretReferences(inputSecret.secretValue);
    const allSecretReferences = nestedReferences.concat(
      localReferences.map((el) => ({ secretKey: el, secretPath, environment }))
    );

    await $validateSecretReferences(projectId, permission, allSecretReferences);

    const { encryptor: secretManagerEncryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId
    });
    const secret = await secretDAL.transaction(async (tx) => {
      const [createdSecret] = await fnSecretBulkInsert({
        folderId,
        orgId: actorOrgId,
        inputSecrets: [
          {
            version: 1,
            type,
            reminderRepeatDays: inputSecretData.secretReminderRepeatDays,
            encryptedComment: setKnexStringValue(
              inputSecretData.secretComment,
              (value) => secretManagerEncryptor({ plainText: Buffer.from(value) }).cipherTextBlob
            ),
            encryptedValue: inputSecretData.secretValue
              ? secretManagerEncryptor({ plainText: Buffer.from(inputSecretData.secretValue) }).cipherTextBlob
              : undefined,
            reminderNote: inputSecretData.secretReminderNote,
            skipMultilineEncoding: inputSecretData.skipMultilineEncoding,
            key: secretName,
            userId: inputSecret.type === SecretType.Personal ? actorId : null,
            tagIds: inputSecret.tagIds,
            references: nestedReferences,
            metadata: secretMetadata ? JSON.stringify(secretMetadata) : [],
            secretMetadata
          }
        ],
        resourceMetadataDAL,
        secretDAL,
        secretVersionDAL,
        folderCommitService,
        secretTagDAL,
        secretVersionTagDAL,
        actor: {
          type: actor,
          actorId
        },
        tx
      });

      return createdSecret;
    });

    await secretDAL.invalidateSecretCacheByProjectId(projectId);
    if (inputSecret.type === SecretType.Shared) {
      await snapshotService.performSnapshot(folderId);
      await secretQueueService.syncSecrets({
        secretPath,
        orgId: actorOrgId,
        actorId,
        actor,
        projectId,
        environmentSlug: folder.environment.slug
      });
    }

    return reshapeBridgeSecret(
      projectId,
      environment,
      secretPath,
      {
        ...secret,
        value: inputSecret.secretValue,
        comment: inputSecret.secretComment || ""
      },
      false
    );
  };

  const updateSecret = async ({
    actor,
    actorId,
    actorOrgId,
    environment,
    actorAuthMethod,
    projectId,
    secretPath,
    secretMetadata,
    ...inputSecret
  }: TUpdateSecretDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    });

    if (inputSecret.newSecretName === "") {
      throw new BadRequestError({ message: "New secret name cannot be empty" });
    }

    const folder = await folderDAL.findBySecretPath(projectId, environment, secretPath);
    if (!folder)
      throw new NotFoundError({
        message: `Folder with path '${secretPath}' in environment with slug '${environment}' not found`,
        name: "UpdateSecret"
      });
    const folderId = folder.id;

    if (ActorType.USER !== actor && inputSecret.type === SecretType.Personal) {
      throw new BadRequestError({ message: "Must be user to create personal secret" });
    }

    if (inputSecret.newSecretName && inputSecret.type === SecretType.Personal) {
      throw new BadRequestError({ message: "Personal secret cannot change the key name" });
    }

    let secret;
    let secretId: string;
    if (inputSecret.type === SecretType.Personal) {
      const personalSecretToModify = await secretDAL.findOne({
        key: inputSecret.secretName,
        type: SecretType.Personal,
        folderId,
        userId: actorId
      });
      if (!personalSecretToModify)
        throw new NotFoundError({ message: `Personal secret with name ${inputSecret.secretName} not found` });
      secretId = personalSecretToModify.id;
      secret = personalSecretToModify;
    } else {
      const sharedSecretToModify = await secretDAL.findOne({
        key: inputSecret.secretName,
        type: SecretType.Shared,
        folderId
      });
      if (!sharedSecretToModify)
        throw new NotFoundError({ message: `Secret with name ${inputSecret.secretName} not found` });
      if (sharedSecretToModify.isRotatedSecret && (inputSecret.newSecretName || inputSecret.secretValue))
        throw new BadRequestError({ message: "Cannot update rotated secret name or value" });
      secretId = sharedSecretToModify.id;
      secret = sharedSecretToModify;
    }

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionSecretActions.Edit,
      subject(ProjectPermissionSub.Secrets, {
        environment,
        secretPath,
        secretName: inputSecret.secretName,
        secretTags: secret.tags.map((el) => el.slug)
      })
    );

    // validate tags
    // fetch all tags and if not same count throw error meaning one was invalid tags
    const newTags = inputSecret.tagIds ? await secretTagDAL.find({ projectId, $in: { id: inputSecret.tagIds } }) : [];
    if ((inputSecret.tagIds || []).length !== newTags.length)
      throw new NotFoundError({ message: `Tag not found. Found ${newTags.map((el) => el.slug).join(",")}` });

    const tagsToCheck = inputSecret.tagIds ? newTags : secret.tags;

    // now check with new ids
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionSecretActions.Edit,
      subject(ProjectPermissionSub.Secrets, {
        environment,
        secretPath,
        secretName: inputSecret.secretName,
        ...(tagsToCheck.length && {
          secretTags: tagsToCheck.map((el) => el.slug)
        })
      })
    );

    if (inputSecret.newSecretName) {
      const doesNewNameSecretExist = await secretDAL.findOne({
        key: inputSecret.newSecretName,
        type: SecretType.Shared,
        folderId
      });
      if (doesNewNameSecretExist) throw new BadRequestError({ message: "Secret with the new name already exist" });
      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionSecretActions.Edit,
        subject(ProjectPermissionSub.Secrets, {
          environment,
          secretPath,
          secretName: inputSecret.newSecretName,
          ...(tagsToCheck.length && {
            secretTags: tagsToCheck.map((el) => el.slug)
          })
        })
      );
    }

    const { secretName, secretValue } = inputSecret;

    const { encryptor: secretManagerEncryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId
    });
    const encryptedValue =
      typeof secretValue === "string"
        ? {
            encryptedValue: secretManagerEncryptor({ plainText: Buffer.from(secretValue) }).cipherTextBlob,
            references: getAllSecretReferences(secretValue).nestedReferences
          }
        : {};

    if (secretValue) {
      const { nestedReferences, localReferences } = getAllSecretReferences(secretValue);
      const allSecretReferences = nestedReferences.concat(
        localReferences.map((el) => ({ secretKey: el, secretPath, environment }))
      );
      await $validateSecretReferences(projectId, permission, allSecretReferences);
    }

    const updatedSecret = await secretDAL.transaction(async (tx) =>
      fnSecretBulkUpdate({
        folderId,
        orgId: actorOrgId,
        resourceMetadataDAL,
        folderCommitService,
        inputSecrets: [
          {
            filter: { id: secretId },
            data: {
              reminderRepeatDays: inputSecret.secretReminderRepeatDays,
              encryptedComment: setKnexStringValue(
                inputSecret.secretComment,
                (value) => secretManagerEncryptor({ plainText: Buffer.from(value) }).cipherTextBlob
              ),
              reminderNote: inputSecret.secretReminderNote,
              skipMultilineEncoding: inputSecret.skipMultilineEncoding,
              key: inputSecret.newSecretName || secretName,
              tags: inputSecret.tagIds,
              metadata: secretMetadata ? JSON.stringify(secretMetadata) : [],
              secretMetadata,
              ...encryptedValue
            }
          }
        ],
        secretDAL,
        secretVersionDAL,
        secretTagDAL,
        secretVersionTagDAL,
        actor: {
          type: actor,
          actorId
        },
        tx
      })
    );
    await secretQueueService.handleSecretReminder({
      newSecret: {
        id: updatedSecret[0].id,
        ...inputSecret
      },
      oldSecret: {
        id: secret.id,
        secretReminderNote: secret.reminderNote,
        secretReminderRepeatDays: secret.reminderRepeatDays,
        secretReminderRecipients: secret.secretReminderRecipients?.map((el) => el.user.id)
      },
      projectId
    });

    await secretDAL.invalidateSecretCacheByProjectId(projectId);
    if (inputSecret.type === SecretType.Shared) {
      await snapshotService.performSnapshot(folderId);
      await secretQueueService.syncSecrets({
        secretPath,
        actorId,
        actor,
        projectId,
        orgId: actorOrgId,
        environmentSlug: folder.environment.slug
      });
    }

    const secretValueHidden = !hasSecretReadValueOrDescribePermission(
      permission,
      ProjectPermissionSecretActions.ReadValue,
      {
        environment,
        secretPath,
        secretName: inputSecret.secretName,
        ...(tagsToCheck.length && {
          secretTags: tagsToCheck.map((el) => el.slug)
        })
      }
    );

    return reshapeBridgeSecret(
      projectId,
      environment,
      secretPath,
      {
        ...updatedSecret[0],
        value: inputSecret.secretValue || "",
        comment: inputSecret.secretComment || ""
      },
      secretValueHidden
    );
  };

  const deleteSecret = async ({
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    environment,
    projectId,
    secretPath,
    ...inputSecret
  }: TDeleteSecretDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    });

    const folder = await folderDAL.findBySecretPath(projectId, environment, secretPath);
    if (!folder)
      throw new NotFoundError({
        message: `Folder with path '${secretPath}' in environment with slug '${environment}' not found`,
        name: "DeleteSecret"
      });
    const folderId = folder.id;

    if (ActorType.USER !== actor && inputSecret.type === SecretType.Personal) {
      throw new BadRequestError({ message: "Must be user to delete personal secret" });
    }

    const secretToDelete = await secretDAL.findOne({
      key: inputSecret.secretName,
      folderId,
      ...(inputSecret.type === SecretType.Shared
        ? {}
        : {
            type: SecretType.Personal,
            userId: actorId
          })
    });
    if (!secretToDelete) throw new NotFoundError({ message: "Secret not found" });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionSecretActions.Delete,
      subject(ProjectPermissionSub.Secrets, {
        environment,
        secretPath,
        secretName: secretToDelete.key,
        secretTags: secretToDelete.tags?.map((el) => el.slug)
      })
    );

    try {
      const deletedSecret = await secretDAL.transaction(async (tx) =>
        fnSecretBulkDelete({
          projectId,
          folderId,
          actorId,
          actorType: actor,
          folderCommitService,
          secretVersionDAL,
          secretDAL,
          secretQueueService,
          inputSecrets: [
            {
              type: inputSecret.type as SecretType,
              secretKey: inputSecret.secretName
            }
          ],
          tx
        })
      );

      await secretDAL.invalidateSecretCacheByProjectId(projectId);
      if (inputSecret.type === SecretType.Shared) {
        await snapshotService.performSnapshot(folderId);
        await secretQueueService.syncSecrets({
          secretPath,
          actorId,
          actor,
          projectId,
          orgId: actorOrgId,
          environmentSlug: folder.environment.slug
        });
      }

      const { decryptor: secretManagerDecryptor } = await kmsService.createCipherPairWithDataKey({
        type: KmsDataKey.SecretManager,
        projectId
      });

      const secretValueHidden = !hasSecretReadValueOrDescribePermission(
        permission,
        ProjectPermissionSecretActions.ReadValue,
        {
          environment,
          secretPath,
          secretName: secretToDelete.key,
          secretTags: secretToDelete.tags?.map((el) => el.slug)
        }
      );

      return reshapeBridgeSecret(
        projectId,
        environment,
        secretPath,
        {
          ...deletedSecret[0],
          value: deletedSecret[0].encryptedValue
            ? secretManagerDecryptor({ cipherTextBlob: deletedSecret[0].encryptedValue }).toString()
            : "",
          comment: deletedSecret[0].encryptedComment
            ? secretManagerDecryptor({ cipherTextBlob: deletedSecret[0].encryptedComment }).toString()
            : ""
        },
        secretValueHidden
      );
    } catch (err) {
      // deferred errors aren't return as DatabaseError
      const error = err as { code: string; table: string };
      if (
        error?.code === DatabaseErrorCode.ForeignKeyViolation &&
        error?.table === TableName.SecretRotationV2SecretMapping
      ) {
        throw new BadRequestError({ message: "Cannot delete rotated secrets" });
      }

      throw err;
    }
  };

  // get unique secrets count for multiple envs
  const getSecretsCountMultiEnv = async ({
    actorId,
    path,
    projectId,
    actor,
    actorOrgId,
    actorAuthMethod,
    environments,
    isInternal,
    ...params
  }: Pick<TGetSecretsDTO, "actorId" | "actor" | "path" | "projectId" | "actorOrgId" | "actorAuthMethod" | "search"> & {
    environments: string[];
    isInternal?: boolean;
  }) => {
    if (!isInternal) {
      const { permission } = await permissionService.getProjectPermission({
        actor,
        actorId,
        projectId,
        actorAuthMethod,
        actorOrgId
      });
      throwIfMissingSecretReadValueOrDescribePermission(permission, ProjectPermissionSecretActions.DescribeSecret);
    }

    const folders = await folderDAL.findBySecretPathMultiEnv(projectId, environments, path);
    if (!folders.length) return 0;

    const count = await secretDAL.countByFolderIds(
      folders.map((folder) => folder.id),
      actorId,
      undefined,
      params
    );

    return count;
  };

  // get secret count for individual env
  const getSecretsCount = async ({
    actorId,
    path,
    environment,
    projectId,
    actor,
    actorOrgId,
    actorAuthMethod,
    ...params
  }: Pick<
    TGetSecretsDTO,
    | "actorId"
    | "actor"
    | "path"
    | "projectId"
    | "actorOrgId"
    | "actorAuthMethod"
    | "tagSlugs"
    | "environment"
    | "search"
  >) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    });
    throwIfMissingSecretReadValueOrDescribePermission(permission, ProjectPermissionSecretActions.DescribeSecret);

    const folder = await folderDAL.findBySecretPath(projectId, environment, path);
    if (!folder) return 0;

    const count = await secretDAL.countByFolderIds([folder.id], actorId, undefined, params);

    return count;
  };

  const getSecretsByFolderMappings = async (
    {
      projectId,
      userId,
      filters,
      folderMappings,
      filterByAction = ProjectPermissionSecretActions.ReadValue
    }: TGetSecretsRawByFolderMappingsDTO,
    projectPermission: Awaited<ReturnType<typeof permissionService.getProjectPermission>>["permission"]
  ) => {
    const groupedFolderMappings = groupBy(folderMappings, (folderMapping) => folderMapping.folderId);

    const secrets = await secretDAL.findByFolderIds({
      folderIds: folderMappings.map((folderMapping) => folderMapping.folderId),
      userId,
      tx: undefined,
      filters
    });

    const { decryptor: secretManagerDecryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId
    });

    const decryptedSecrets = secrets
      .filter((el) =>
        hasSecretReadValueOrDescribePermission(projectPermission, filterByAction, {
          environment: groupedFolderMappings[el.folderId][0].environment,
          secretPath: groupedFolderMappings[el.folderId][0].path,
          secretName: el.key,
          secretTags: el.tags.map((i) => i.slug)
        })
      )

      .map((secret) => {
        // Note(Daniel): This is only relevant if the filterAction isn't set to ReadValue. This is needed for the frontend.
        const secretValueHidden = !hasSecretReadValueOrDescribePermission(
          projectPermission,
          ProjectPermissionSecretActions.ReadValue,
          {
            environment: groupedFolderMappings[secret.folderId][0].environment,
            secretPath: groupedFolderMappings[secret.folderId][0].path,
            secretName: secret.key,
            secretTags: secret.tags.map((i) => i.slug)
          }
        );

        return reshapeBridgeSecret(
          projectId,
          groupedFolderMappings[secret.folderId][0].environment,
          groupedFolderMappings[secret.folderId][0].path,
          {
            ...secret,
            value: secret.encryptedValue
              ? secretManagerDecryptor({ cipherTextBlob: secret.encryptedValue }).toString()
              : "",
            comment: secret.encryptedComment
              ? secretManagerDecryptor({ cipherTextBlob: secret.encryptedComment }).toString()
              : ""
          },
          secretValueHidden
        );
      });

    return decryptedSecrets;
  };

  // get secrets for multiple envs
  const getSecretsMultiEnv = async ({
    actorId,
    path,
    environments,
    projectId,
    actor,
    actorOrgId,
    actorAuthMethod,
    isInternal,
    ...params
  }: Pick<TGetSecretsDTO, "actorId" | "actor" | "path" | "projectId" | "actorOrgId" | "actorAuthMethod" | "search"> & {
    environments: string[];
    isInternal?: boolean;
  }) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    });
    if (!isInternal) {
      throwIfMissingSecretReadValueOrDescribePermission(permission, ProjectPermissionSecretActions.DescribeSecret);
    }

    const folders = await folderDAL.findBySecretPathMultiEnv(projectId, environments, path);

    if (!folders.length) {
      return [];
    }

    const folderMappings = folders.map((folder) => ({
      folderId: folder.id,
      path,
      environment: folder.environment.slug
    }));

    const decryptedSecrets = await getSecretsByFolderMappings(
      {
        projectId,
        folderMappings,
        filters: params,
        userId: actorId,
        filterByAction: ProjectPermissionSecretActions.DescribeSecret
      },
      permission
    );

    return decryptedSecrets;
  };

  const getSecrets = async (dto: TGetSecretsDTO) => {
    const {
      actorId,
      path,
      environment,
      projectId,
      actor,
      actorOrgId,
      viewSecretValue,
      actorAuthMethod,
      includeImports,
      recursive,
      expandSecretReferences: shouldExpandSecretReferences,
      throwOnMissingReadValuePermission = true,
      ...params
    } = dto;
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    });
    throwIfMissingSecretReadValueOrDescribePermission(permission, ProjectPermissionSecretActions.DescribeSecret);

    const cachedSecretDalVersion = await keyStore.getItem(SecretServiceCacheKeys.getSecretDalVersion(projectId));
    const secretDalVersion = Number(cachedSecretDalVersion || 0);
    const cacheKey = SecretServiceCacheKeys.getSecretsOfServiceLayer(projectId, secretDalVersion, {
      ...dto,
      permissionRules: permission.rules
    });

    const { decryptor: secretManagerDecryptor, encryptor: secretManagerEncryptor } =
      await kmsService.createCipherPairWithDataKey({
        type: KmsDataKey.SecretManager,
        projectId
      });

    const encryptedCachedSecrets = await keyStore.getItem(cacheKey);
    if (encryptedCachedSecrets) {
      try {
        await keyStore.setExpiry(cacheKey, SECRET_DAL_TTL());
        const cachedSecrets = secretManagerDecryptor({ cipherTextBlob: Buffer.from(encryptedCachedSecrets, "base64") });
        const { secrets, imports = [] } = JSON.parse(cachedSecrets.toString("utf8")) as {
          secrets: typeof decryptedSecrets;
          imports: typeof importedSecrets;
        };
        return {
          secrets: secrets.map((el) => ({
            ...el,
            createdAt: new Date(el.createdAt),
            updatedAt: new Date(el.updatedAt)
          })),
          imports
        };
      } catch (err) {
        logger.error(err, "Secret service layer cache miss");
        await keyStore.deleteItem(cacheKey);
      }
    }

    let paths: { folderId: string; path: string }[] = [];

    if (recursive) {
      const deepPaths = await recursivelyGetSecretPaths({
        folderDAL,
        projectEnvDAL,
        projectId,
        environment,
        currentPath: path
      });

      if (!deepPaths) return { secrets: [], imports: [] };

      paths = deepPaths.map(({ folderId, path: p }) => ({ folderId, path: p }));
    } else {
      const folder = await folderDAL.findBySecretPath(projectId, environment, path);
      if (!folder) return { secrets: [], imports: [] };

      paths = [{ folderId: folder.id, path }];
    }

    const groupedPaths = groupBy(paths, (p) => p.folderId);

    const secrets = await secretDAL.findByFolderIds({
      folderIds: paths.map((p) => p.folderId),
      userId: actorId,
      tx: undefined,
      filters: params
    });

    // scott: if any of this changes it also needs to be mirrored in secret rotation for getting dashboard secrets
    const decryptedSecrets = secrets
      .filter((el) => {
        const canDescribeSecret = hasSecretReadValueOrDescribePermission(
          permission,
          ProjectPermissionSecretActions.DescribeSecret,
          {
            environment,
            secretPath: groupedPaths[el.folderId][0].path,
            secretName: el.key,
            secretTags: el.tags.map((i) => i.slug)
          }
        );

        if (!canDescribeSecret) {
          return false;
        }

        if (viewSecretValue) {
          // Recursive secret, should be filtered out
          if (groupedPaths[el.folderId][0].path !== path) {
            const canReadRecursiveSecretValue = hasSecretReadValueOrDescribePermission(
              permission,
              ProjectPermissionSecretActions.ReadValue,
              {
                environment,
                secretPath: groupedPaths[el.folderId][0].path,
                secretName: el.key,
                secretTags: el.tags.map((i) => i.slug)
              }
            );

            if (!canReadRecursiveSecretValue) {
              return false;
            }
          }

          if (throwOnMissingReadValuePermission) {
            throwIfMissingSecretReadValueOrDescribePermission(permission, ProjectPermissionSecretActions.ReadValue, {
              environment,
              secretPath: groupedPaths[el.folderId][0].path,
              secretName: el.key,
              secretTags: el.tags.map((i) => i.slug)
            });
          }
          // Else, we do nothing. Because we don't want to filter out the secret, OR throw an error.
          // If the user doesn't have access to read the value, in the below map function, we mask the secret value and return the secret with a hidden value.
        }

        return canDescribeSecret;
      })
      .map((secret) => {
        const isPersonalSecret = secret.userId === actorId && secret.type === SecretType.Personal;

        const secretValueHidden =
          !viewSecretValue ||
          !hasSecretReadValueOrDescribePermission(permission, ProjectPermissionSecretActions.ReadValue, {
            environment,
            secretPath: groupedPaths[secret.folderId][0].path,
            secretName: secret.key,
            secretTags: secret.tags.map((i) => i.slug)
          });

        return reshapeBridgeSecret(
          projectId,
          environment,
          groupedPaths[secret.folderId][0].path,
          {
            ...secret,
            value: secret.encryptedValue
              ? secretManagerDecryptor({ cipherTextBlob: secret.encryptedValue }).toString()
              : "",
            comment: secret.encryptedComment
              ? secretManagerDecryptor({ cipherTextBlob: secret.encryptedComment }).toString()
              : ""
          },
          secretValueHidden && !isPersonalSecret
        );
      });

    const { expandSecretReferences } = expandSecretReferencesFactory({
      projectId,
      folderDAL,
      secretDAL,
      decryptSecretValue: (value) => (value ? secretManagerDecryptor({ cipherTextBlob: value }).toString() : undefined),
      canExpandValue: (expandEnvironment, expandSecretPath, expandSecretKey, expandSecretTags) =>
        hasSecretReadValueOrDescribePermission(permission, ProjectPermissionSecretActions.ReadValue, {
          environment: expandEnvironment,
          secretPath: expandSecretPath,
          secretName: expandSecretKey,
          secretTags: expandSecretTags
        })
    });

    if (shouldExpandSecretReferences) {
      const secretsGroupByPath = groupBy(decryptedSecrets, (i) => i.secretPath);
      await Promise.allSettled(
        Object.keys(secretsGroupByPath).map((groupedPath) =>
          Promise.allSettled(
            secretsGroupByPath[groupedPath].map(async (decryptedSecret, index) => {
              const expandedSecretValue = await expandSecretReferences({
                value: decryptedSecret.secretValue,
                secretPath: groupedPath,
                environment,
                skipMultilineEncoding: decryptedSecret.skipMultilineEncoding
              });
              // eslint-disable-next-line no-param-reassign
              secretsGroupByPath[groupedPath][index].secretValue = expandedSecretValue || "";
            })
          )
        )
      );
    }

    if (!includeImports) {
      const payload = { secrets: decryptedSecrets, imports: [] };
      const encryptedUpdatedCachedSecrets = secretManagerEncryptor({
        plainText: Buffer.from(JSON.stringify(payload))
      }).cipherTextBlob;
      if (encryptedUpdatedCachedSecrets.byteLength < MAX_SECRET_CACHE_BYTES) {
        await keyStore.setItemWithExpiry(cacheKey, SECRET_DAL_TTL(), encryptedUpdatedCachedSecrets.toString("base64"));
      }
      return payload;
    }

    const secretImports = await secretImportDAL.findByFolderIds(paths.map((p) => p.folderId));
    const allowedImports = secretImports.filter(({ isReplication }) => !isReplication);
    const importedSecrets = await fnSecretsV2FromImports({
      viewSecretValue,
      secretImports: allowedImports,
      secretDAL,
      folderDAL,
      secretImportDAL,
      expandSecretReferences,
      decryptor: (value) => (value ? secretManagerDecryptor({ cipherTextBlob: value }).toString() : ""),
      hasSecretAccess: (expandEnvironment, expandSecretPath, expandSecretKey, expandSecretTags) => {
        const canDescribe = hasSecretReadValueOrDescribePermission(
          permission,
          ProjectPermissionSecretActions.DescribeSecret,
          {
            environment: expandEnvironment,
            secretPath: expandSecretPath,
            secretName: expandSecretKey,
            secretTags: expandSecretTags
          }
        );

        const canReadValue = hasSecretReadValueOrDescribePermission(
          permission,
          ProjectPermissionSecretActions.ReadValue,
          {
            environment: expandEnvironment,
            secretPath: expandSecretPath,
            secretName: expandSecretKey,
            secretTags: expandSecretTags
          }
        );

        return viewSecretValue ? canDescribe && canReadValue : canDescribe;
      }
    });

    const payload = { secrets: decryptedSecrets, imports: importedSecrets };
    const encryptedUpdatedCachedSecrets = secretManagerEncryptor({
      plainText: Buffer.from(JSON.stringify(payload))
    }).cipherTextBlob;
    if (encryptedUpdatedCachedSecrets.byteLength < MAX_SECRET_CACHE_BYTES) {
      await keyStore.setItemWithExpiry(cacheKey, SECRET_DAL_TTL(), encryptedUpdatedCachedSecrets.toString("base64"));
    }
    return payload;
  };

  const getSecretById = async ({ actorId, actor, actorOrgId, actorAuthMethod, secretId }: TGetASecretByIdDTO) => {
    const secret = await secretDAL.findOneWithTags({
      [`${TableName.SecretV2}.id` as "id"]: secretId
    });

    if (!secret) {
      throw new NotFoundError({
        message: `Secret with ID '${secretId}' not found`,
        name: "GetSecretById"
      });
    }

    const [folderWithPath] = await folderDAL.findSecretPathByFolderIds(secret.projectId, [secret.folderId]);

    if (!folderWithPath) {
      throw new NotFoundError({
        message: `Folder with id '${secret.folderId}' not found`,
        name: "GetSecretById"
      });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: secret.projectId,
      actorAuthMethod,
      actorOrgId
    });

    throwIfMissingSecretReadValueOrDescribePermission(permission, ProjectPermissionSecretActions.ReadValue, {
      environment: folderWithPath.environmentSlug,
      secretPath: folderWithPath.path,
      secretName: secret.key,
      secretTags: secret.tags.map((i) => i.slug)
    });

    if (secret.type === SecretType.Personal && secret.userId !== actorId) {
      throw new ForbiddenRequestError({
        message: "You are not allowed to access this secret",
        name: "GetSecretById"
      });
    }

    const { decryptor: secretManagerDecryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId: secret.projectId
    });

    const secretValue = secret.encryptedValue
      ? secretManagerDecryptor({ cipherTextBlob: secret.encryptedValue }).toString()
      : "";

    const secretComment = secret.encryptedComment
      ? secretManagerDecryptor({ cipherTextBlob: secret.encryptedComment }).toString()
      : "";

    return reshapeBridgeSecret(
      secret.projectId,
      folderWithPath.environmentSlug,
      folderWithPath.path,
      {
        ...secret,
        value: secretValue,
        comment: secretComment
      },
      false
    );
  };

  const getSecretByName = async ({
    actorId,
    actor,
    actorOrgId,
    actorAuthMethod,
    projectId,
    environment,
    path,
    type,
    secretName,
    version,
    viewSecretValue,
    includeImports,
    expandSecretReferences: shouldExpandSecretReferences
  }: TGetASecretDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    });

    const folder = await folderDAL.findBySecretPath(projectId, environment, path);
    if (!folder)
      throw new NotFoundError({
        message: `Folder with path '${path}' in environment with slug '${environment}' not found`,
        name: "GetSecretByName"
      });
    const folderId = folder.id;

    let secretType = type;
    if (actor === ActorType.SERVICE) {
      logger.info(
        `secretServiceFactory: overriding secret type for service token [projectId=${projectId}] [factoryFunctionName=getSecretByName]`
      );
      secretType = SecretType.Shared;
    }

    const { decryptor: secretManagerDecryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId
    });

    const secret = await (version === undefined
      ? secretDAL.findOneWithTags({
          folderId,
          type: secretType,
          [`${TableName.SecretV2}.key` as "key"]: secretName,
          [`${TableName.SecretV2}.userId` as "userId"]: secretType === SecretType.Personal ? actorId : null
        })
      : secretVersionDAL
          .findOne({
            folderId,
            version,
            type: secretType,
            userId: secretType === SecretType.Personal ? actorId : null,
            key: secretName
          })
          .then((el) =>
            el
              ? SecretsV2Schema.extend({
                  tags: z
                    .object({ slug: z.string(), name: z.string(), id: z.string(), color: z.string() })
                    .array()
                    .default([])
                    .optional()
                }).parse({
                  ...el,
                  id: el.secretId
                })
              : undefined
          ));

    throwIfMissingSecretReadValueOrDescribePermission(permission, ProjectPermissionSecretActions.DescribeSecret, {
      environment,
      secretPath: path,
      secretName,
      secretTags: (secret?.tags || []).map((el) => el.slug)
    });

    // this will throw if the user doesn't have read value permission no matter what
    // because if its an expansion, it will fully depend on the value.
    const { expandSecretReferences } = expandSecretReferencesFactory({
      projectId,
      folderDAL,
      secretDAL,
      decryptSecretValue: (value) => (value ? secretManagerDecryptor({ cipherTextBlob: value }).toString() : undefined),
      canExpandValue: (expandEnvironment, expandSecretPath, expandSecretKey, expandSecretTags) => {
        return hasSecretReadValueOrDescribePermission(permission, ProjectPermissionSecretActions.ReadValue, {
          environment: expandEnvironment,
          secretPath: expandSecretPath,
          secretName: expandSecretKey,
          secretTags: expandSecretTags
        });
      }
    });

    // now if secret is not found
    // then search for imported secrets
    // here we consider the import order also thus starting from bottom

    // currently filters out the secrets that the user doesn't have access to read value on
    if (!secret && includeImports) {
      const secretImports = await secretImportDAL.find({ folderId, isReplication: false });
      const importedSecrets = await fnSecretsV2FromImports({
        secretImports,
        viewSecretValue,
        secretDAL,
        folderDAL,
        secretImportDAL,
        decryptor: (value) => (value ? secretManagerDecryptor({ cipherTextBlob: value }).toString() : ""),
        expandSecretReferences: shouldExpandSecretReferences && viewSecretValue ? expandSecretReferences : undefined,
        hasSecretAccess: (expandEnvironment, expandSecretPath, expandSecretKey, expandSecretTags) => {
          return hasSecretReadValueOrDescribePermission(permission, ProjectPermissionSecretActions.DescribeSecret, {
            environment: expandEnvironment,
            secretPath: expandSecretPath,
            secretName: expandSecretKey,
            secretTags: expandSecretTags
          });
        }
      });

      for (let i = importedSecrets.length - 1; i >= 0; i -= 1) {
        for (let j = 0; j < importedSecrets[i].secrets.length; j += 1) {
          const importedSecret = importedSecrets[i].secrets[j];
          if (secretName === importedSecret.key) {
            let secretValueHidden = true;

            if (viewSecretValue) {
              if (
                !hasSecretReadValueOrDescribePermission(permission, ProjectPermissionSecretActions.ReadValue, {
                  environment: importedSecret.environment,
                  secretPath: importedSecrets[i].secretPath,
                  secretName: importedSecret.key,
                  secretTags: (importedSecret.secretTags || []).map((el) => el.slug)
                }) &&
                secretType !== SecretType.Personal
              ) {
                throw new ForbiddenRequestError({
                  message: `You do not have permission to view secret import value on secret with name '${secretName}'`,
                  name: "ForbiddenReadSecretError"
                });
              }

              secretValueHidden = false;
            }

            return reshapeBridgeSecret(
              projectId,
              importedSecrets[i].environment,
              importedSecrets[i].secretPath,
              {
                ...importedSecret,
                value: importedSecret.secretValue || "",
                comment: importedSecret.secretComment || ""
              },
              secretValueHidden
            );
          }
        }
      }
    }
    if (!secret) throw new NotFoundError({ message: `Secret with name '${secretName}' not found` });

    let secretValue = secret.encryptedValue
      ? secretManagerDecryptor({ cipherTextBlob: secret.encryptedValue }).toString()
      : "";
    if (shouldExpandSecretReferences && secretValue && viewSecretValue) {
      // eslint-disable-next-line
      const expandedSecretValue = await expandSecretReferences({
        environment,
        secretPath: path,
        value: secretValue,
        skipMultilineEncoding: secret.skipMultilineEncoding
      });

      secretValue = expandedSecretValue || "";
    }

    let secretValueHidden = true;

    if (viewSecretValue) {
      if (
        !hasSecretReadValueOrDescribePermission(permission, ProjectPermissionSecretActions.ReadValue, {
          environment,
          secretPath: path,
          secretName,
          secretTags: (secret?.tags || []).map((el) => el.slug)
        }) &&
        secretType !== SecretType.Personal
      ) {
        throw new ForbiddenRequestError({
          message: `You do not have permission to view secret value on secret with name '${secretName}'`,
          name: "ForbiddenReadSecretError"
        });
      }

      secretValueHidden = false;
    }

    return reshapeBridgeSecret(
      projectId,
      environment,
      path,
      {
        ...secret,
        value: secretValue,
        comment: secret.encryptedComment
          ? secretManagerDecryptor({ cipherTextBlob: secret.encryptedComment }).toString()
          : ""
      },
      secretValueHidden
    );
  };

  const createManySecret = async ({
    secretPath,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    environment,
    projectId,
    secrets: inputSecrets
  }: TCreateManySecretDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    });

    const folder = await folderDAL.findBySecretPath(projectId, environment, secretPath);
    if (!folder)
      throw new NotFoundError({
        message: `Folder with path '${secretPath}' in environment with slug '${environment}' not found`,
        name: "CreateManySecret"
      });
    const folderId = folder.id;

    const secrets = await secretDAL.find({
      folderId,
      $complex: {
        operator: "and",
        value: [
          {
            operator: "or",
            value: inputSecrets.map((el) => ({
              operator: "and",
              value: [
                {
                  operator: "eq",
                  field: `${TableName.SecretV2}.key` as "key",
                  value: el.secretKey
                },
                {
                  operator: "eq",
                  field: "type",
                  value: SecretType.Shared
                }
              ]
            }))
          }
        ]
      }
    });
    if (secrets.length)
      throw new BadRequestError({ message: `Secret already exist: ${secrets.map((el) => el.key).join(",")}` });

    // get all tags
    const sanitizedTagIds = inputSecrets.flatMap(({ tagIds = [] }) => tagIds);
    const tags = sanitizedTagIds.length ? await secretTagDAL.findManyTagsById(projectId, sanitizedTagIds) : [];
    if (tags.length !== sanitizedTagIds.length)
      throw new NotFoundError({ message: `Tag not found. Found ${tags.map((el) => el.slug).join(",")}` });
    const tagsGroupByID = groupBy(tags, (i) => i.id);

    inputSecrets.forEach((el) => {
      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionSecretActions.Create,
        subject(ProjectPermissionSub.Secrets, {
          environment,
          secretPath,
          secretName: el.secretKey,
          secretTags: (el.tagIds || []).map((i) => tagsGroupByID[i][0].slug)
        })
      );
    });

    // now get all secret references made and validate the permission
    const secretReferencesGroupByInputSecretKey: Record<string, ReturnType<typeof getAllSecretReferences>> = {};
    const secretReferences: TSecretReference[] = [];
    inputSecrets.forEach((el) => {
      if (el.secretValue) {
        const references = getAllSecretReferences(el.secretValue);
        secretReferencesGroupByInputSecretKey[el.secretKey] = references;
        secretReferences.push(...references.nestedReferences);
        references.localReferences.forEach((localRefKey) => {
          secretReferences.push({ secretKey: localRefKey, secretPath, environment });
        });
      }
    });
    await $validateSecretReferences(projectId, permission, secretReferences);

    const { encryptor: secretManagerEncryptor, decryptor: secretManagerDecryptor } =
      await kmsService.createCipherPairWithDataKey({ type: KmsDataKey.SecretManager, projectId });

    const newSecrets = await secretDAL.transaction(async (tx) =>
      fnSecretBulkInsert({
        inputSecrets: inputSecrets.map((el) => {
          const references = secretReferencesGroupByInputSecretKey[el.secretKey]?.nestedReferences;

          return {
            version: 1,
            encryptedComment: setKnexStringValue(
              el.secretComment,
              (value) => secretManagerEncryptor({ plainText: Buffer.from(value) }).cipherTextBlob
            ),
            encryptedValue: el.secretValue
              ? secretManagerEncryptor({ plainText: Buffer.from(el.secretValue) }).cipherTextBlob
              : undefined,
            skipMultilineEncoding: el.skipMultilineEncoding,
            key: el.secretKey,
            tagIds: el.tagIds,
            references,
            secretMetadata: el.secretMetadata,
            type: SecretType.Shared
          };
        }),
        folderId,
        orgId: actorOrgId,
        secretDAL,
        resourceMetadataDAL,
        folderCommitService,
        secretVersionDAL,
        secretTagDAL,
        secretVersionTagDAL,
        actor: {
          type: actor,
          actorId
        },
        tx
      })
    );
    await secretDAL.invalidateSecretCacheByProjectId(projectId);
    await snapshotService.performSnapshot(folderId);
    await secretQueueService.syncSecrets({
      actor,
      actorId,
      secretPath,
      projectId,
      orgId: actorOrgId,
      environmentSlug: folder.environment.slug
    });

    return newSecrets.map((el) => {
      const secretValueHidden = !hasSecretReadValueOrDescribePermission(
        permission,
        ProjectPermissionSecretActions.ReadValue,
        {
          environment,
          secretPath,
          secretName: el.key,
          secretTags: el.tags?.map((i) => i.slug)
        }
      );

      return reshapeBridgeSecret(
        projectId,
        environment,
        secretPath,
        {
          ...el,
          value: el.encryptedValue ? secretManagerDecryptor({ cipherTextBlob: el.encryptedValue }).toString() : "",
          comment: el.encryptedComment ? secretManagerDecryptor({ cipherTextBlob: el.encryptedComment }).toString() : ""
        },
        secretValueHidden
      );
    });
  };

  const updateManySecret = async ({
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    environment,
    projectId,
    secretPath: defaultSecretPath = "/",
    secrets: inputSecrets,
    mode: updateMode
  }: TUpdateManySecretDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    });

    const secretsToUpdateGroupByPath = groupBy(inputSecrets, (el) => el.secretPath || defaultSecretPath);
    const projectEnvironment = await projectEnvDAL.findOne({ projectId, slug: environment });
    if (!projectEnvironment) {
      throw new NotFoundError({
        message: `Environment with slug '${environment}' in project with ID '${projectId}' not found`
      });
    }

    const folders = await folderDAL.findByManySecretPath(
      Object.keys(secretsToUpdateGroupByPath).map((el) => ({ envId: projectEnvironment.id, secretPath: el }))
    );
    if (folders.length !== Object.keys(secretsToUpdateGroupByPath).length)
      throw new NotFoundError({
        message: `Folder with path '${null}' in environment with slug '${environment}' not found`,
        name: "UpdateManySecret"
      });

    const { encryptor: secretManagerEncryptor, decryptor: secretManagerDecryptor } =
      await kmsService.createCipherPairWithDataKey({ type: KmsDataKey.SecretManager, projectId });

    const updatedSecrets: Array<
      TSecretsV2 & {
        secretPath: string;
        tags: {
          id: string;
          slug: string;
          color?: string | null;
          name: string;
        }[];
      }
    > = [];
    await secretDAL.transaction(async (tx) => {
      for await (const folder of folders) {
        if (!folder) throw new NotFoundError({ message: "Folder not found" });

        const folderId = folder.id;
        const secretPath = folder.path;
        let secretsToUpdate = secretsToUpdateGroupByPath[secretPath];
        const secretsToUpdateInDB = await secretDAL.find(
          {
            folderId,
            $complex: {
              operator: "and",
              value: [
                {
                  operator: "or",
                  value: secretsToUpdate.map((el) => ({
                    operator: "and",
                    value: [
                      {
                        operator: "eq",
                        field: `${TableName.SecretV2}.key` as "key",
                        value: el.secretKey
                      },
                      {
                        operator: "eq",
                        field: "type",
                        value: SecretType.Shared
                      }
                    ]
                  }))
                }
              ]
            }
          },
          { tx }
        );
        if (secretsToUpdateInDB.length !== secretsToUpdate.length && updateMode === SecretUpdateMode.FailOnNotFound)
          throw new NotFoundError({
            message: `Secret does not exist: ${diff(
              secretsToUpdate.map((el) => el.secretKey),
              secretsToUpdateInDB.map((el) => el.key)
            ).join(", ")} in path ${folder.path}`
          });

        const secretsToUpdateInDBGroupedByKey = groupBy(secretsToUpdateInDB, (i) => i.key);
        const secretsToCreate = secretsToUpdate.filter((el) => !secretsToUpdateInDBGroupedByKey?.[el.secretKey]);
        secretsToUpdate = secretsToUpdate.filter((el) => secretsToUpdateInDBGroupedByKey?.[el.secretKey]);

        secretsToUpdateInDB.forEach((el) => {
          ForbiddenError.from(permission).throwUnlessCan(
            ProjectPermissionSecretActions.Edit,
            subject(ProjectPermissionSub.Secrets, {
              environment,
              secretPath,
              secretName: el.key,
              secretTags: el.tags.map((i) => i.slug)
            })
          );

          if (el.isRotatedSecret) {
            const input = secretsToUpdateGroupByPath[secretPath].find((i) => i.secretKey === el.key);

            if (input && (input.newSecretName || input.secretValue))
              throw new BadRequestError({ message: `Cannot update rotated secret name or value: ${el.key}` });
          }
        });

        // get all tags
        const sanitizedTagIds = secretsToUpdate.flatMap(({ tagIds = [] }) => tagIds);
        const tags = sanitizedTagIds.length ? await secretTagDAL.findManyTagsById(projectId, sanitizedTagIds, tx) : [];
        if (tags.length !== sanitizedTagIds.length) throw new NotFoundError({ message: "Tag not found" });
        const tagsGroupByID = groupBy(tags, (i) => i.id);

        // check create permission allowed in upsert mode
        if (updateMode === SecretUpdateMode.Upsert) {
          secretsToCreate.forEach((el) => {
            ForbiddenError.from(permission).throwUnlessCan(
              ProjectPermissionSecretActions.Create,
              subject(ProjectPermissionSub.Secrets, {
                environment,
                secretPath,
                secretName: el.secretKey,
                secretTags: (el.tagIds || []).map((i) => tagsGroupByID[i][0].slug)
              })
            );
          });
        }

        // check again to avoid non authorized tags are removed
        secretsToUpdate.forEach((el) => {
          ForbiddenError.from(permission).throwUnlessCan(
            ProjectPermissionSecretActions.Edit,
            subject(ProjectPermissionSub.Secrets, {
              environment,
              secretPath,
              secretName: el.secretKey,
              secretTags: (el.tagIds || []).map((i) => tagsGroupByID[i][0].slug)
            })
          );
        });

        // now find any secret that needs to update its name
        // same process as above
        const secretsWithNewName = secretsToUpdate.filter(({ newSecretName }) => Boolean(newSecretName));
        if (secretsWithNewName.length) {
          const secrets = await secretDAL.find(
            {
              folderId,
              $complex: {
                operator: "and",
                value: [
                  {
                    operator: "or",
                    value: secretsWithNewName.map((el) => ({
                      operator: "and",
                      value: [
                        {
                          operator: "eq",
                          field: `${TableName.SecretV2}.key` as "key",
                          value: el.secretKey
                        },
                        {
                          operator: "eq",
                          field: "type",
                          value: SecretType.Shared
                        }
                      ]
                    }))
                  }
                ]
              }
            },
            { tx }
          );
          if (secrets.length)
            throw new BadRequestError({
              message: `Secret with new name already exists: ${secretsWithNewName
                .map((el) => el.newSecretName)
                .join(", ")}`
            });

          secretsWithNewName.forEach((el) => {
            ForbiddenError.from(permission).throwUnlessCan(
              ProjectPermissionSecretActions.Create,
              subject(ProjectPermissionSub.Secrets, {
                environment,
                secretPath,
                secretName: el.newSecretName as string,
                secretTags: (el.tagIds || []).map((i) => tagsGroupByID[i][0].slug)
              })
            );
          });
        }
        // now get all secret references made and validate the permission
        const secretReferencesGroupByInputSecretKey: Record<string, ReturnType<typeof getAllSecretReferences>> = {};
        const secretReferences: TSecretReference[] = [];
        secretsToUpdate.concat(SecretUpdateMode.Upsert === updateMode ? secretsToCreate : []).forEach((el) => {
          if (el.secretValue) {
            const references = getAllSecretReferences(el.secretValue);
            secretReferencesGroupByInputSecretKey[el.secretKey] = references;
            secretReferences.push(...references.nestedReferences);
            references.localReferences.forEach((localRefKey) => {
              secretReferences.push({ secretKey: localRefKey, secretPath, environment });
            });
          }
        });
        await $validateSecretReferences(projectId, permission, secretReferences, tx);

        const bulkUpdatedSecrets = await fnSecretBulkUpdate({
          folderId,
          orgId: actorOrgId,
          folderCommitService,
          tx,
          inputSecrets: secretsToUpdate.map((el) => {
            const originalSecret = secretsToUpdateInDBGroupedByKey[el.secretKey][0];
            const encryptedValue =
              typeof el.secretValue !== "undefined"
                ? {
                    encryptedValue: secretManagerEncryptor({ plainText: Buffer.from(el.secretValue) }).cipherTextBlob,
                    references: secretReferencesGroupByInputSecretKey[el.secretKey]?.nestedReferences
                  }
                : {};

            return {
              filter: { id: originalSecret.id, type: SecretType.Shared },
              data: {
                reminderRepeatDays: el.secretReminderRepeatDays,
                encryptedComment: setKnexStringValue(
                  el.secretComment,
                  (value) => secretManagerEncryptor({ plainText: Buffer.from(value) }).cipherTextBlob
                ),
                reminderNote: el.secretReminderNote,
                skipMultilineEncoding: el.skipMultilineEncoding,
                key: el.newSecretName || el.secretKey,
                tags: el.tagIds,
                secretMetadata: el.secretMetadata,
                ...encryptedValue
              }
            };
          }),
          secretDAL,
          secretVersionDAL,
          secretTagDAL,
          secretVersionTagDAL,
          actor: {
            type: actor,
            actorId
          },
          resourceMetadataDAL
        });

        updatedSecrets.push(...bulkUpdatedSecrets.map((el) => ({ ...el, secretPath: folder.path })));
        if (updateMode === SecretUpdateMode.Upsert) {
          const bulkInsertedSecrets = await fnSecretBulkInsert({
            inputSecrets: secretsToCreate.map((el) => {
              const references = secretReferencesGroupByInputSecretKey[el.secretKey]?.nestedReferences;

              return {
                version: 1,
                encryptedComment: setKnexStringValue(
                  el.secretComment,
                  (value) => secretManagerEncryptor({ plainText: Buffer.from(value) }).cipherTextBlob
                ),
                encryptedValue: el.secretValue
                  ? secretManagerEncryptor({ plainText: Buffer.from(el.secretValue) }).cipherTextBlob
                  : undefined,
                skipMultilineEncoding: el.skipMultilineEncoding,
                key: el.secretKey,
                tagIds: el.tagIds,
                references,
                secretMetadata: el.secretMetadata,
                type: SecretType.Shared
              };
            }),
            folderId,
            orgId: actorOrgId,
            secretDAL,
            resourceMetadataDAL,
            secretVersionDAL,
            secretTagDAL,
            secretVersionTagDAL,
            folderCommitService,
            actor: {
              type: actor,
              actorId
            },
            tx
          });

          updatedSecrets.push(...bulkInsertedSecrets.map((el) => ({ ...el, secretPath: folder.path })));
        }
      }
    });

    await secretDAL.invalidateSecretCacheByProjectId(projectId);
    await Promise.allSettled(folders.map((el) => (el?.id ? snapshotService.performSnapshot(el.id) : undefined)));
    await Promise.allSettled(
      folders.map((el) =>
        el
          ? secretQueueService.syncSecrets({
              actor,
              actorId,
              secretPath: el.path,
              projectId,
              orgId: actorOrgId,
              environmentSlug: environment
            })
          : undefined
      )
    );

    return updatedSecrets.map((el) => {
      const secretValueHidden = !hasSecretReadValueOrDescribePermission(
        permission,
        ProjectPermissionSecretActions.ReadValue,
        {
          environment,
          secretPath: el.secretPath,
          secretName: el.key,
          secretTags: el.tags.map((i) => i.slug)
        }
      );

      return {
        ...reshapeBridgeSecret(
          projectId,
          environment,
          el.secretPath,
          {
            ...el,
            value: el.encryptedValue ? secretManagerDecryptor({ cipherTextBlob: el.encryptedValue }).toString() : "",
            comment: el.encryptedComment
              ? secretManagerDecryptor({ cipherTextBlob: el.encryptedComment }).toString()
              : ""
          },
          secretValueHidden
        )
      };
    });
  };

  const deleteManySecret = async ({
    secrets: inputSecrets,
    secretPath,
    environment,
    projectId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TDeleteManySecretDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    });

    const folder = await folderDAL.findBySecretPath(projectId, environment, secretPath);
    if (!folder)
      throw new NotFoundError({
        message: `Folder with path '${secretPath}' in environment with slug '${environment}' not found`,
        name: "DeleteManySecret"
      });
    const folderId = folder.id;

    const secretsToDelete = await secretDAL.find({
      folderId,
      $complex: {
        operator: "and",
        value: [
          {
            operator: "or",
            value: inputSecrets.map((el) => ({
              operator: "and",
              value: [
                {
                  operator: "eq",
                  field: `${TableName.SecretV2}.key` as "key",
                  value: el.secretKey
                },
                {
                  operator: "eq",
                  field: "type",
                  value: SecretType.Shared
                }
              ]
            }))
          }
        ]
      }
    });
    if (secretsToDelete.length !== inputSecrets.length)
      throw new NotFoundError({
        message: `One or more secrets does not exist: ${secretsToDelete.map((el) => el.key).join(", ")}`
      });
    secretsToDelete.forEach((el) => {
      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionSecretActions.Delete,
        subject(ProjectPermissionSub.Secrets, {
          environment,
          secretPath,
          secretName: el.key,
          secretTags: el.tags?.map((i) => i.slug)
        })
      );
    });

    try {
      const secretsDeleted = await secretDAL.transaction(async (tx) =>
        fnSecretBulkDelete({
          secretDAL,
          secretQueueService,
          folderCommitService,
          secretVersionDAL,
          inputSecrets: inputSecrets.map(({ type, secretKey }) => ({
            secretKey,
            type: type || SecretType.Shared
          })),
          projectId,
          folderId,
          actorId,
          actorType: actor,
          tx
        })
      );

      await secretDAL.invalidateSecretCacheByProjectId(projectId);
      await snapshotService.performSnapshot(folderId);
      await secretQueueService.syncSecrets({
        actor,
        actorId,
        secretPath,
        projectId,
        orgId: actorOrgId,
        environmentSlug: folder.environment.slug
      });

      const { decryptor: secretManagerDecryptor } = await kmsService.createCipherPairWithDataKey({
        type: KmsDataKey.SecretManager,
        projectId
      });
      return secretsDeleted.map((el) => {
        const secretToDeleteMatch = secretsToDelete.find(
          (i) => i.key === el.key && (i.type || SecretType.Shared) === el.type
        );

        const secretValueHidden =
          !secretToDeleteMatch ||
          !hasSecretReadValueOrDescribePermission(permission, ProjectPermissionSecretActions.ReadValue, {
            environment,
            secretPath,
            secretName: el.key,
            secretTags: secretToDeleteMatch.tags?.map((i) => i.slug)
          });

        return reshapeBridgeSecret(
          projectId,
          environment,
          secretPath,
          {
            ...el,
            value: el.encryptedValue ? secretManagerDecryptor({ cipherTextBlob: el.encryptedValue }).toString() : "",
            comment: el.encryptedComment
              ? secretManagerDecryptor({ cipherTextBlob: el.encryptedComment }).toString()
              : ""
          },
          secretValueHidden
        );
      });
    } catch (err) {
      // deferred errors aren't return as DatabaseError
      const error = err as { code: string; table: string };
      if (
        error?.code === DatabaseErrorCode.ForeignKeyViolation &&
        error?.table === TableName.SecretRotationV2SecretMapping
      ) {
        throw new BadRequestError({ message: "Cannot delete rotated secrets" });
      }

      throw err;
    }
  };

  const getSecretVersions = async ({
    actorId,
    actor,
    actorOrgId,
    actorAuthMethod,
    limit = 20,
    offset = 0,
    secretId
  }: TGetSecretVersionsDTO) => {
    const secret = await secretDAL.findById(secretId);

    if (!secret) throw new NotFoundError({ message: `Secret with ID '${secretId}' not found` });

    const folder = await folderDAL.findById(secret.folderId);
    if (!folder) throw new NotFoundError({ message: `Folder with ID '${secret.folderId}' not found` });

    const [folderWithPath] = await folderDAL.findSecretPathByFolderIds(folder.projectId, [folder.id]);

    if (!folderWithPath) {
      throw new NotFoundError({ message: `Folder with ID '${folder.id}' not found` });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: folder.projectId,
      actorAuthMethod,
      actorOrgId
    });

    const canRead =
      permission.can(ProjectPermissionActions.Read, ProjectPermissionSub.SecretRollback) ||
      permission.can(ProjectPermissionCommitsActions.Read, ProjectPermissionSub.Commits);

    if (!canRead) throw new ForbiddenRequestError({ message: "You do not have permission to read secret versions" });

    const { decryptor: secretManagerDecryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId: folder.projectId
    });
    const secretVersions = await secretVersionDAL.findVersionsBySecretIdWithActors({
      secretId,
      projectId: folder.projectId,
      findOpt: {
        offset,
        limit,
        sort: [["createdAt", "desc"]]
      }
    });
    return secretVersions.map((el) => {
      const secretValueHidden = !hasSecretReadValueOrDescribePermission(
        permission,
        ProjectPermissionSecretActions.ReadValue,
        {
          environment: folder.environment.envSlug,
          secretPath: folderWithPath.path,
          secretName: el.key,
          ...(el.tags?.length && {
            secretTags: el.tags.map((tag) => tag.slug)
          })
        }
      );

      return reshapeBridgeSecret(
        folder.projectId,
        folder.environment.envSlug,
        folderWithPath.path,
        {
          ...el,
          value: el.encryptedValue ? secretManagerDecryptor({ cipherTextBlob: el.encryptedValue }).toString() : "",
          comment: el.encryptedComment ? secretManagerDecryptor({ cipherTextBlob: el.encryptedComment }).toString() : ""
        },
        secretValueHidden
      );
    });
  };

  // this is a backfilling API for secret references
  // what it does is it will go through all the secret values and parse all references
  // populate the secret reference to do sync integrations
  const backfillSecretReferences = async ({
    projectId,
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod
  }: TBackFillSecretReferencesDTO) => {
    const { hasRole } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    });

    if (!hasRole(ProjectMembershipRole.Admin))
      throw new ForbiddenRequestError({ message: "Only admins are allowed to take this action" });

    const { decryptor: secretManagerDecryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId
    });
    await secretDAL.transaction(async (tx) => {
      const secrets = await secretDAL.findAllProjectSecretValues(projectId, tx);
      await secretDAL.upsertSecretReferences(
        secrets
          .filter((el) => Boolean(el.encryptedValue))
          .map(({ id, encryptedValue }) => ({
            secretId: id,
            references: encryptedValue
              ? getAllSecretReferences(secretManagerDecryptor({ cipherTextBlob: encryptedValue }).toString())
                  .nestedReferences
              : []
          })),
        tx
      );
    });

    return { message: "Successfully backfilled secret references" };
  };

  const moveSecrets = async ({
    sourceEnvironment,
    sourceSecretPath,
    destinationEnvironment,
    destinationSecretPath,
    secretIds,
    projectId,
    shouldOverwrite,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TMoveSecretsDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    });

    const sourceFolder = await folderDAL.findBySecretPath(projectId, sourceEnvironment, sourceSecretPath);
    if (!sourceFolder) {
      throw new NotFoundError({
        message: `Source folder with path '${sourceSecretPath}' in environment with slug '${sourceEnvironment}' not found`
      });
    }

    const destinationFolder = await folderDAL.findBySecretPath(
      projectId,
      destinationEnvironment,
      destinationSecretPath
    );

    if (!destinationFolder) {
      throw new NotFoundError({
        message: `Destination folder with path '${destinationSecretPath}' in environment with slug '${destinationEnvironment}' not found`
      });
    }

    const sourceSecrets = await secretDAL.find({
      type: SecretType.Shared,
      $in: {
        [`${TableName.SecretV2}.id` as "id"]: secretIds
      }
    });

    const sourceActions = [
      ProjectPermissionSecretActions.Delete,
      ProjectPermissionSecretActions.ReadValue,
      ProjectPermissionSecretActions.DescribeSecret
    ] as const;
    const destinationActions = [ProjectPermissionSecretActions.Create, ProjectPermissionSecretActions.Edit] as const;

    sourceSecrets.forEach((secret) => {
      if (secret.isRotatedSecret) {
        throw new BadRequestError({ message: `Cannot move rotated secret: ${secret.key}` });
      }

      for (const sourceAction of sourceActions) {
        if (
          sourceAction === ProjectPermissionSecretActions.DescribeSecret ||
          sourceAction === ProjectPermissionSecretActions.ReadValue
        ) {
          throwIfMissingSecretReadValueOrDescribePermission(permission, sourceAction, {
            environment: sourceEnvironment,
            secretPath: sourceSecretPath,
            secretName: secret.key,
            secretTags: secret.tags.map((el) => el.slug)
          });
        } else {
          ForbiddenError.from(permission).throwUnlessCan(
            sourceAction,
            subject(ProjectPermissionSub.Secrets, {
              environment: sourceEnvironment,
              secretPath: sourceSecretPath,
              secretName: secret.key,
              secretTags: secret.tags.map((el) => el.slug)
            })
          );
        }
      }
    });

    if (sourceSecrets.length !== secretIds.length) {
      throw new BadRequestError({
        message: "Invalid secrets"
      });
    }

    const { decryptor: secretManagerDecryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId
    });
    const decryptedSourceSecrets = sourceSecrets.map((secret) => ({
      ...secret,
      value: secret.encryptedValue
        ? secretManagerDecryptor({ cipherTextBlob: secret.encryptedValue }).toString()
        : undefined
    }));

    let isSourceUpdated = false;
    let isDestinationUpdated = false;

    // Moving secrets is a two-step process.
    await secretDAL.transaction(async (tx) => {
      // First step is to create/update the secret in the destination:
      const destinationSecretsFromDB = await secretDAL.find(
        {
          folderId: destinationFolder.id
        },
        { tx }
      );

      const decryptedDestinationSecrets = destinationSecretsFromDB.map((secret) => {
        return {
          ...secret,
          value: secret.encryptedValue
            ? secretManagerDecryptor({ cipherTextBlob: secret.encryptedValue }).toString()
            : undefined
        };
      });

      const destinationSecretsGroupedByKey = groupBy(decryptedDestinationSecrets, (i) => i.key);

      const locallyCreatedSecrets = decryptedSourceSecrets
        .filter(({ key }) => !destinationSecretsGroupedByKey[key]?.[0])
        .map((el) => ({ ...el, operation: SecretOperations.Create }));

      const locallyUpdatedSecrets = decryptedSourceSecrets
        .filter(
          ({ key, value }) =>
            destinationSecretsGroupedByKey[key]?.[0] && destinationSecretsGroupedByKey[key]?.[0]?.value !== value
        )
        .map((el) => ({ ...el, operation: SecretOperations.Update }));

      if (locallyUpdatedSecrets.length > 0 && !shouldOverwrite) {
        const existingKeys = locallyUpdatedSecrets.map((s) => s.key);

        throw new BadRequestError({
          message: `Failed to move secrets. The following secrets already exist in the destination: ${existingKeys.join(
            ","
          )}`
        });
      }

      const isEmpty = locallyCreatedSecrets.length + locallyUpdatedSecrets.length === 0;

      if (isEmpty) {
        throw new BadRequestError({
          message: "Selected secrets already exist in the destination."
        });
      }

      // permission check whether can create or edit the ones in the destination folder
      locallyCreatedSecrets.forEach((secret) => {
        for (const destinationAction of destinationActions) {
          ForbiddenError.from(permission).throwUnlessCan(
            destinationAction,
            subject(ProjectPermissionSub.Secrets, {
              environment: destinationEnvironment,
              secretPath: destinationFolder.path,
              secretName: secret.key,
              secretTags: secret.tags.map((el) => el.slug)
            })
          );
        }
      });

      const destinationFolderPolicy = await secretApprovalPolicyService.getSecretApprovalPolicy(
        projectId,
        destinationFolder.environment.slug,
        destinationFolder.path
      );

      if (destinationFolderPolicy && actor === ActorType.USER) {
        // if secret approval policy exists for destination, we create the secret approval request
        const localSecretsIds = decryptedDestinationSecrets.map(({ id }) => id);
        const latestSecretVersions = await secretVersionDAL.findLatestVersionMany(
          destinationFolder.id,
          localSecretsIds,
          tx
        );

        const approvalRequestDoc = await secretApprovalRequestDAL.create(
          {
            folderId: destinationFolder.id,
            slug: alphaNumericNanoId(),
            policyId: destinationFolderPolicy.id,
            status: "open",
            hasMerged: false,
            committerUserId: actorId
          },
          tx
        );

        const commits = locallyCreatedSecrets.concat(locallyUpdatedSecrets).map((doc) => {
          const { operation } = doc;
          const localSecret = destinationSecretsGroupedByKey[doc.key]?.[0];

          return {
            op: operation,
            requestId: approvalRequestDoc.id,
            metadata: doc.metadata,
            key: doc.key,
            encryptedValue: doc.encryptedValue,
            encryptedComment: doc.encryptedComment,
            skipMultilineEncoding: doc.skipMultilineEncoding,
            // except create operation other two needs the secret id and version id
            ...(operation !== SecretOperations.Create
              ? { secretId: localSecret.id, secretVersion: latestSecretVersions[localSecret.id].id }
              : {})
          };
        });
        await secretApprovalRequestSecretDAL.insertV2Bridge(commits, tx);
      } else {
        // apply changes directly
        if (locallyCreatedSecrets.length) {
          await fnSecretBulkInsert({
            folderId: destinationFolder.id,
            orgId: actorOrgId,
            secretVersionDAL,
            secretDAL,
            tx,
            secretTagDAL,
            resourceMetadataDAL,
            folderCommitService,
            secretVersionTagDAL,
            actor: {
              type: actor,
              actorId
            },
            inputSecrets: locallyCreatedSecrets.map((doc) => {
              return {
                type: doc.type,
                metadata: doc.metadata,
                key: doc.key,
                encryptedValue: doc.encryptedValue,
                encryptedComment: doc.encryptedComment,
                skipMultilineEncoding: doc.skipMultilineEncoding,
                reminderNote: doc.reminderNote,
                reminderRepeatDays: doc.reminderRepeatDays,
                secretMetadata: doc.secretMetadata,
                references: doc.value ? getAllSecretReferences(doc.value).nestedReferences : []
              };
            })
          });
        }
        if (locallyUpdatedSecrets.length) {
          await fnSecretBulkUpdate({
            folderId: destinationFolder.id,
            orgId: actorOrgId,
            resourceMetadataDAL,
            folderCommitService,
            secretVersionDAL,
            secretDAL,
            tx,
            secretTagDAL,
            secretVersionTagDAL,
            actor: {
              type: actor,
              actorId
            },
            inputSecrets: locallyUpdatedSecrets.map((doc) => {
              return {
                filter: {
                  folderId: destinationFolder.id,
                  id: destinationSecretsGroupedByKey[doc.key][0].id
                },
                data: {
                  metadata: doc.metadata,
                  key: doc.key,
                  encryptedComment: doc.encryptedComment,
                  skipMultilineEncoding: doc.skipMultilineEncoding,
                  reminderNote: doc.reminderNote,
                  secretMetadata: doc.secretMetadata,
                  reminderRepeatDays: doc.reminderRepeatDays,
                  ...(doc.encryptedValue
                    ? {
                        encryptedValue: doc.encryptedValue,
                        references: doc.value ? getAllSecretReferences(doc.value).nestedReferences : []
                      }
                    : {
                        encryptedValue: undefined,
                        references: undefined
                      })
                }
              };
            })
          });
        }

        isDestinationUpdated = true;
      }

      // Next step is to delete the secrets from the source folder:
      const sourceSecretsGroupByKey = groupBy(sourceSecrets, (i) => i.key);
      const locallyDeletedSecrets = decryptedSourceSecrets.map((el) => ({ ...el, operation: SecretOperations.Delete }));

      const sourceFolderPolicy = await secretApprovalPolicyService.getSecretApprovalPolicy(
        projectId,
        sourceFolder.environment.slug,
        sourceFolder.path
      );

      if (sourceFolderPolicy && actor === ActorType.USER) {
        // if secret approval policy exists for source, we create the secret approval request
        const localSecretsIds = decryptedSourceSecrets.map(({ id }) => id);
        const latestSecretVersions = await secretVersionDAL.findLatestVersionMany(sourceFolder.id, localSecretsIds, tx);
        const approvalRequestDoc = await secretApprovalRequestDAL.create(
          {
            folderId: sourceFolder.id,
            slug: alphaNumericNanoId(),
            policyId: sourceFolderPolicy.id,
            status: "open",
            hasMerged: false,
            committerUserId: actorId
          },
          tx
        );

        const commits = locallyDeletedSecrets.map((doc) => {
          const { operation } = doc;
          const localSecret = sourceSecretsGroupByKey[doc.key]?.[0];

          return {
            op: operation,
            requestId: approvalRequestDoc.id,
            metadata: doc.metadata,
            key: doc.key,
            encryptedComment: doc.encryptedComment,
            encryptedValue: doc.encryptedValue,
            skipMultilineEncoding: doc.skipMultilineEncoding,
            secretId: localSecret.id,
            secretVersion: latestSecretVersions[localSecret.id].id
          };
        });

        await secretApprovalRequestSecretDAL.insertV2Bridge(commits, tx);
      } else {
        // if no secret approval policy is present, we delete directly.
        await secretDAL.delete(
          {
            $in: {
              id: locallyDeletedSecrets.map(({ id }) => id)
            },
            folderId: sourceFolder.id
          },
          tx
        );

        isSourceUpdated = true;
      }
    });

    if (isDestinationUpdated || isSourceUpdated) {
      await secretDAL.invalidateSecretCacheByProjectId(projectId);
    }
    if (isDestinationUpdated) {
      await snapshotService.performSnapshot(destinationFolder.id);
      await secretQueueService.syncSecrets({
        projectId,
        orgId: actorOrgId,
        secretPath: destinationFolder.path,
        environmentSlug: destinationFolder.environment.slug,
        actorId,
        actor
      });
    }

    if (isSourceUpdated) {
      await snapshotService.performSnapshot(sourceFolder.id);
      await secretQueueService.syncSecrets({
        projectId,
        orgId: actorOrgId,
        secretPath: sourceFolder.path,
        environmentSlug: sourceFolder.environment.slug,
        actorId,
        actor
      });
    }

    return {
      projectId,
      isSourceUpdated,
      isDestinationUpdated
    };
  };

  const getSecretReferenceTree = async ({
    environment,
    secretPath,
    projectId,
    actor,
    actorId,
    actorOrgId,
    secretName,
    actorAuthMethod
  }: TGetSecretReferencesTreeDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    });

    throwIfMissingSecretReadValueOrDescribePermission(permission, ProjectPermissionSecretActions.DescribeSecret, {
      environment,
      secretPath
    });

    const folder = await folderDAL.findBySecretPath(projectId, environment, secretPath);
    if (!folder)
      throw new NotFoundError({
        message: "Folder not found for the given environment slug & secret path",
        name: "Create secret"
      });
    const folderId = folder.id;

    const { decryptor: secretManagerDecryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId
    });

    const secret = await secretDAL.findOne({
      folderId,
      key: secretName,
      type: SecretType.Shared
    });

    if (!secret) throw new NotFoundError({ message: `Secret with name '${secretName}' not found` });

    throwIfMissingSecretReadValueOrDescribePermission(permission, ProjectPermissionSecretActions.DescribeSecret, {
      environment,
      secretPath,
      secretName,
      secretTags: (secret?.tags || []).map((el) => el.slug)
    });

    const decryptedSecretValue = secret?.encryptedValue
      ? secretManagerDecryptor({ cipherTextBlob: secret.encryptedValue }).toString()
      : "";

    const { getExpandedSecretStackTrace } = expandSecretReferencesFactory({
      projectId,
      folderDAL,
      secretDAL,
      decryptSecretValue: (value) => (value ? secretManagerDecryptor({ cipherTextBlob: value }).toString() : undefined),
      canExpandValue: (expandEnvironment, expandSecretPath, expandSecretName, expandSecretTags) =>
        hasSecretReadValueOrDescribePermission(permission, ProjectPermissionSecretActions.ReadValue, {
          environment: expandEnvironment,
          secretPath: expandSecretPath,
          secretName: expandSecretName,
          secretTags: expandSecretTags
        })
    });

    if (
      !hasSecretReadValueOrDescribePermission(permission, ProjectPermissionSecretActions.ReadValue, {
        environment,
        secretPath,
        secretName,
        secretTags: (secret?.tags || []).map((el) => el.slug)
      })
    ) {
      throw new ForbiddenRequestError({
        message: `Unable to get secret reference tree for secret with key '${secretName}', because you don't have permission to view secret value.`
      });
    }

    const { expandedValue, stackTrace } = await getExpandedSecretStackTrace({
      environment,
      secretPath,
      value: decryptedSecretValue
    });

    return { tree: stackTrace, value: expandedValue };
  };

  const getAccessibleSecrets = async ({
    projectId,
    secretPath,
    environment,
    filterByAction,
    actorId,
    actor,
    actorAuthMethod,
    actorOrgId,
    recursive
  }: TGetAccessibleSecretsDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    });
    throwIfMissingSecretReadValueOrDescribePermission(permission, ProjectPermissionSecretActions.DescribeSecret, {
      environment,
      secretPath
    });

    const folders = [];
    const folder = await folderDAL.findBySecretPath(projectId, environment, secretPath);
    if (!folder) return { secrets: [] };
    folders.push({ ...folder, parentId: null });

    const env = await projectEnvDAL.findOne({
      projectId,
      slug: environment
    });

    if (!env) {
      throw new NotFoundError({
        message: `Environment with slug '${environment}' in project with ID ${projectId} not found`
      });
    }

    if (recursive) {
      const subFolders = await folderDAL.find({
        envId: env.id,
        isReserved: false
      });
      folders.push(...subFolders);
    }

    if (folders.length === 0) return { secrets: [] };

    const folderMap = buildHierarchy(folders);
    const paths = Object.fromEntries(
      generatePaths(folderMap).map(({ folderId, path }) => [folderId, path === "/" ? path : path.substring(1)])
    );

    const secrets = await secretDAL.findByFolderIds({ folderIds: folders.map((f) => f.id) });

    const { decryptor: secretManagerDecryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId
    });

    const decryptedSecrets = secrets
      .filter((el) => {
        if (
          !hasSecretReadValueOrDescribePermission(permission, ProjectPermissionSecretActions.DescribeSecret, {
            environment,
            secretPath: paths[el.folderId],
            secretName: el.key,
            secretTags: el.tags.map((i) => i.slug)
          })
        ) {
          return false;
        }

        if (filterByAction === ProjectPermissionSecretActions.ReadValue) {
          return hasSecretReadValueOrDescribePermission(permission, ProjectPermissionSecretActions.ReadValue, {
            environment,
            secretPath: paths[el.folderId],
            secretName: el.key,
            secretTags: el.tags.map((i) => i.slug)
          });
        }

        return true;
      })
      .map((secret) => {
        const secretValueHidden =
          filterByAction === ProjectPermissionSecretActions.DescribeSecret &&
          !hasSecretReadValueOrDescribePermission(permission, ProjectPermissionSecretActions.ReadValue, {
            environment,
            secretPath: paths[secret.folderId],
            secretName: secret.key,
            secretTags: secret.tags.map((i) => i.slug)
          });

        return reshapeBridgeSecret(
          projectId,
          environment,
          paths[secret.folderId],
          {
            ...secret,
            value: secret.encryptedValue
              ? secretManagerDecryptor({ cipherTextBlob: secret.encryptedValue }).toString()
              : "",
            comment: secret.encryptedComment
              ? secretManagerDecryptor({ cipherTextBlob: secret.encryptedComment }).toString()
              : ""
          },
          secretValueHidden
        );
      });

    return {
      secrets: decryptedSecrets
    };
  };

  const getSecretVersionsByIds = async ({
    actorId,
    actor,
    actorOrgId,
    actorAuthMethod,
    secretId,
    secretVersionNumbers,
    secretPath,
    envId,
    projectId
  }: TGetSecretVersionsDTO & {
    secretVersionNumbers: string[];
    secretPath: string;
    envId: string;
    projectId: string;
  }) => {
    const environment = await projectEnvDAL.findOne({ id: envId, projectId });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    });

    const canRead =
      permission.can(ProjectPermissionActions.Read, ProjectPermissionSub.SecretRollback) ||
      permission.can(ProjectPermissionCommitsActions.Read, ProjectPermissionSub.Commits);

    if (!canRead) throw new ForbiddenRequestError({ message: "You do not have permission to read secret versions" });

    const { decryptor: secretManagerDecryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId
    });
    const secretVersions = await secretVersionDAL.findVersionsBySecretIdWithActors({
      secretId,
      projectId,
      secretVersions: secretVersionNumbers
    });
    return secretVersions.map((el) => {
      const secretValueHidden = !hasSecretReadValueOrDescribePermission(
        permission,
        ProjectPermissionSecretActions.ReadValue,
        {
          environment: environment.slug,
          secretPath,
          secretName: el.key,
          ...(el.tags?.length && {
            secretTags: el.tags.map((tag) => tag.slug)
          })
        }
      );

      return reshapeBridgeSecret(
        projectId,
        environment.slug,
        secretPath,
        {
          ...el,
          value: el.encryptedValue ? secretManagerDecryptor({ cipherTextBlob: el.encryptedValue }).toString() : "",
          comment: el.encryptedComment ? secretManagerDecryptor({ cipherTextBlob: el.encryptedComment }).toString() : ""
        },
        secretValueHidden
      );
    });
  };

  return {
    createSecret,
    deleteSecret,
    updateSecret,
    createManySecret,
    updateManySecret,
    deleteManySecret,
    getSecretByName,
    getSecrets,
    getSecretVersions,
    backfillSecretReferences,
    moveSecrets,
    getSecretsCount,
    getSecretsCountMultiEnv,
    getSecretsMultiEnv,
    getSecretReferenceTree,
    getSecretsByFolderMappings,
    getSecretById,
    getAccessibleSecrets,
    getSecretVersionsByIds
  };
};
