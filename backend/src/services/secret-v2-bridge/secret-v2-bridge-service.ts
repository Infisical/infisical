import { ForbiddenError, PureAbility, subject } from "@casl/ability";
import { z } from "zod";

import { ProjectMembershipRole, SecretsV2Schema, SecretType, TableName } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { TSecretApprovalPolicyServiceFactory } from "@app/ee/services/secret-approval-policy/secret-approval-policy-service";
import { TSecretApprovalRequestDALFactory } from "@app/ee/services/secret-approval-request/secret-approval-request-dal";
import { TSecretApprovalRequestSecretDALFactory } from "@app/ee/services/secret-approval-request/secret-approval-request-secret-dal";
import { TSecretSnapshotServiceFactory } from "@app/ee/services/secret-snapshot/secret-snapshot-service";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { diff, groupBy } from "@app/lib/fn";
import { setKnexStringValue } from "@app/lib/knex";
import { logger } from "@app/lib/logger";
import { alphaNumericNanoId } from "@app/lib/nanoid";

import { ActorType } from "../auth/auth-type";
import { TKmsServiceFactory } from "../kms/kms-service";
import { KmsDataKey } from "../kms/kms-types";
import { TProjectEnvDALFactory } from "../project-env/project-env-dal";
import { TSecretQueueFactory } from "../secret/secret-queue";
import { TSecretFolderDALFactory } from "../secret-folder/secret-folder-dal";
import { TSecretImportDALFactory } from "../secret-import/secret-import-dal";
import { fnSecretsV2FromImports } from "../secret-import/secret-import-fns";
import { TSecretTagDALFactory } from "../secret-tag/secret-tag-dal";
import { TSecretV2BridgeDALFactory } from "./secret-v2-bridge-dal";
import {
  expandSecretReferencesFactory,
  fnSecretBulkDelete,
  fnSecretBulkInsert,
  fnSecretBulkUpdate,
  getAllSecretReferences,
  recursivelyGetSecretPaths,
  reshapeBridgeSecret
} from "./secret-v2-bridge-fns";
import {
  SecretOperations,
  TBackFillSecretReferencesDTO,
  TCreateManySecretDTO,
  TCreateSecretDTO,
  TDeleteManySecretDTO,
  TDeleteSecretDTO,
  TGetASecretDTO,
  TGetSecretsDTO,
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
  projectEnvDAL: Pick<TProjectEnvDALFactory, "findOne" | "findBySlugs">;
  folderDAL: Pick<
    TSecretFolderDALFactory,
    "findBySecretPath" | "updateById" | "findById" | "findByManySecretPath" | "find" | "findBySecretPathMultiEnv"
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
  folderDAL,
  permissionService,
  snapshotService,
  secretQueueService,
  secretImportDAL,
  secretVersionTagDAL,
  secretApprovalPolicyService,
  secretApprovalRequestDAL,
  secretApprovalRequestSecretDAL,
  kmsService
}: TSecretV2BridgeServiceFactoryDep) => {
  const $validateSecretReferences = async (
    projectId: string,
    permission: PureAbility,
    references: ReturnType<typeof getAllSecretReferences>["nestedReferences"]
  ) => {
    if (!references.length) return;

    const uniqueReferenceEnvironmentSlugs = Array.from(new Set(references.map((el) => el.environment)));
    const referencesEnvironments = await projectEnvDAL.findBySlugs(projectId, uniqueReferenceEnvironmentSlugs);
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
      }))
    );
    const referencesFolderGroupByPath = groupBy(referredFolders.filter(Boolean), (i) => `${i?.envId}-${i?.path}`);
    const referredSecrets = await secretDAL.find({
      $complex: {
        operator: "or",
        value: references.map((el) => {
          const folderId =
            referencesFolderGroupByPath[`${referencesEnvironmentGroupBySlug[el.environment][0].id}-${el.secretPath}`][0]
              ?.id;
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
                field: "key",
                value: el.secretKey
              }
            ]
          };
        })
      }
    });

    if (referredSecrets.length !== references.length)
      throw new BadRequestError({
        message: `Referenced secret not found. Found only ${diff(
          references.map((el) => el.secretKey),
          referredSecrets.map((el) => el.key)
        ).join(",")}`
      });

    const referredSecretsGroupBySecretKey = groupBy(referredSecrets, (i) => i.key);
    references.forEach((el) => {
      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionActions.Read,
        subject(ProjectPermissionSub.Secrets, {
          environment: el.environment,
          secretPath: el.secretPath,
          secretName: el.secretKey,
          tags: referredSecretsGroupBySecretKey[el.secretKey][0]?.tags?.map((i) => i.slug)
        })
      );
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
    ...inputSecret
  }: TCreateSecretDTO) => {
    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );

    const folder = await folderDAL.findBySecretPath(projectId, environment, secretPath);
    if (!folder)
      throw new NotFoundError({
        message: "Folder not found for the given environment slug & secret path",
        name: "Create secret"
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
      ProjectPermissionActions.Create,
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
    const secret = await secretDAL.transaction((tx) =>
      fnSecretBulkInsert({
        folderId,
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
            references: nestedReferences
          }
        ],
        secretDAL,
        secretVersionDAL,
        secretTagDAL,
        secretVersionTagDAL,
        tx
      })
    );

    if (inputSecret.type === SecretType.Shared) {
      await snapshotService.performSnapshot(folderId);
      await secretQueueService.syncSecrets({
        secretPath,
        actorId,
        actor,
        projectId,
        environmentSlug: folder.environment.slug
      });
    }

    return reshapeBridgeSecret(projectId, environment, secretPath, {
      ...secret[0],
      value: inputSecret.secretValue,
      comment: inputSecret.secretComment || ""
    });
  };

  const updateSecret = async ({
    actor,
    actorId,
    actorOrgId,
    environment,
    actorAuthMethod,
    projectId,
    secretPath,
    ...inputSecret
  }: TUpdateSecretDTO) => {
    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );

    if (inputSecret.newSecretName === "") {
      throw new BadRequestError({ message: "New secret name cannot be empty" });
    }

    const folder = await folderDAL.findBySecretPath(projectId, environment, secretPath);
    if (!folder)
      throw new NotFoundError({
        message: "Folder not found for the given environment slug & secret path",
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
      if (!personalSecretToModify) throw new NotFoundError({ message: "Secret not found" });
      secretId = personalSecretToModify.id;
      secret = personalSecretToModify;
    } else {
      const sharedSecretToModify = await secretDAL.findOne({
        key: inputSecret.secretName,
        type: SecretType.Shared,
        folderId
      });
      if (!sharedSecretToModify) throw new NotFoundError({ message: "Secret not found" });
      secretId = sharedSecretToModify.id;
      secret = sharedSecretToModify;
    }

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Edit,
      subject(ProjectPermissionSub.Secrets, {
        environment,
        secretPath,
        secretName: inputSecret.secretName,
        secretTags: secret.tags.map((el) => el.slug)
      })
    );

    // validate tags
    // fetch all tags and if not same count throw error meaning one was invalid tags
    const tags = inputSecret.tagIds ? await secretTagDAL.find({ projectId, $in: { id: inputSecret.tagIds } }) : [];
    if ((inputSecret.tagIds || []).length !== tags.length)
      throw new NotFoundError({ message: `Tag not found. Found ${tags.map((el) => el.slug).join(",")}` });

    // now check with new ids
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Edit,
      subject(ProjectPermissionSub.Secrets, {
        environment,
        secretPath,
        secretName: inputSecret.secretName,
        secretTags: tags?.map((el) => el.slug)
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
        ProjectPermissionActions.Edit,
        subject(ProjectPermissionSub.Secrets, {
          environment,
          secretPath,
          secretName: inputSecret.newSecretName,
          secretTags: tags?.map((el) => el.slug)
        })
      );
    }

    const { secretName, secretValue } = inputSecret;

    const { encryptor: secretManagerEncryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId
    });
    const encryptedValue = secretValue
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
              ...encryptedValue
            }
          }
        ],
        secretDAL,
        secretVersionDAL,
        secretTagDAL,
        secretVersionTagDAL,
        tx
      })
    );
    await secretQueueService.handleSecretReminder({
      newSecret: {
        id: updatedSecret[0].id,
        ...inputSecret
      },
      oldSecret: secret,
      projectId
    });

    if (inputSecret.type === SecretType.Shared) {
      await snapshotService.performSnapshot(folderId);
      await secretQueueService.syncSecrets({
        secretPath,
        actorId,
        actor,
        projectId,
        environmentSlug: folder.environment.slug
      });
    }

    return reshapeBridgeSecret(projectId, environment, secretPath, {
      ...updatedSecret[0],
      value: inputSecret.secretValue || "",
      comment: inputSecret.secretComment || ""
    });
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
    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );

    const folder = await folderDAL.findBySecretPath(projectId, environment, secretPath);
    if (!folder)
      throw new NotFoundError({
        message: "Folder not found for the given environment slug & secret path",
        name: "Delete secret"
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
      ProjectPermissionActions.Delete,
      subject(ProjectPermissionSub.Secrets, {
        environment,
        secretPath,
        secretName: secretToDelete.key,
        secretTags: secretToDelete.tags?.map((el) => el.slug)
      })
    );

    const deletedSecret = await secretDAL.transaction(async (tx) =>
      fnSecretBulkDelete({
        projectId,
        folderId,
        actorId,
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

    if (inputSecret.type === SecretType.Shared) {
      await snapshotService.performSnapshot(folderId);
      await secretQueueService.syncSecrets({
        secretPath,
        actorId,
        actor,
        projectId,
        environmentSlug: folder.environment.slug
      });
    }

    const { decryptor: secretManagerDecryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId
    });
    return reshapeBridgeSecret(projectId, environment, secretPath, {
      ...deletedSecret[0],
      value: deletedSecret[0].encryptedValue
        ? secretManagerDecryptor({ cipherTextBlob: deletedSecret[0].encryptedValue }).toString()
        : "",
      comment: deletedSecret[0].encryptedComment
        ? secretManagerDecryptor({ cipherTextBlob: deletedSecret[0].encryptedComment }).toString()
        : ""
    });
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
      const { permission } = await permissionService.getProjectPermission(
        actor,
        actorId,
        projectId,
        actorAuthMethod,
        actorOrgId
      );

      ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.Secrets);
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
    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.Secrets);

    const folder = await folderDAL.findBySecretPath(projectId, environment, path);
    if (!folder) return 0;

    const count = await secretDAL.countByFolderIds([folder.id], actorId, undefined, params);

    return count;
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
    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );
    if (!isInternal) {
      ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.Secrets);
    }

    let paths: { folderId: string; path: string; environment: string }[] = [];

    const folders = await folderDAL.findBySecretPathMultiEnv(projectId, environments, path);

    if (!folders.length) {
      return [];
    }

    paths = folders.map((folder) => ({ folderId: folder.id, path, environment: folder.environment.slug }));

    const groupedPaths = groupBy(paths, (p) => p.folderId);

    const secrets = await secretDAL.findByFolderIds(
      paths.map((p) => p.folderId),
      actorId,
      undefined,
      params
    );

    const { decryptor: secretManagerDecryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId
    });

    const decryptedSecrets = secrets
      .filter((el) =>
        permission.can(
          ProjectPermissionActions.Read,
          subject(ProjectPermissionSub.Secrets, {
            environment: groupedPaths[el.folderId][0].environment,
            secretPath: groupedPaths[el.folderId][0].path,
            secretName: el.key,
            secretTags: el.tags.map((i) => i.slug)
          })
        )
      )
      .map((secret) =>
        reshapeBridgeSecret(
          projectId,
          groupedPaths[secret.folderId][0].environment,
          groupedPaths[secret.folderId][0].path,
          {
            ...secret,
            value: secret.encryptedValue
              ? secretManagerDecryptor({ cipherTextBlob: secret.encryptedValue }).toString()
              : "",
            comment: secret.encryptedComment
              ? secretManagerDecryptor({ cipherTextBlob: secret.encryptedComment }).toString()
              : ""
          }
        )
      );

    return decryptedSecrets;
  };

  const getSecrets = async ({
    actorId,
    path,
    environment,
    projectId,
    actor,
    actorOrgId,
    actorAuthMethod,
    includeImports,
    recursive,
    expandSecretReferences: shouldExpandSecretReferences,
    ...params
  }: TGetSecretsDTO) => {
    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.Secrets);

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

    const secrets = await secretDAL.findByFolderIds(
      paths.map((p) => p.folderId),
      actorId,
      undefined,
      params
    );

    const { decryptor: secretManagerDecryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId
    });

    const decryptedSecrets = secrets
      .filter((el) =>
        permission.can(
          ProjectPermissionActions.Read,
          subject(ProjectPermissionSub.Secrets, {
            environment,
            secretPath: groupedPaths[el.folderId][0].path,
            secretName: el.key,
            secretTags: el.tags.map((i) => i.slug)
          })
        )
      )
      .map((secret) =>
        reshapeBridgeSecret(projectId, environment, groupedPaths[secret.folderId][0].path, {
          ...secret,
          value: secret.encryptedValue
            ? secretManagerDecryptor({ cipherTextBlob: secret.encryptedValue }).toString()
            : "",
          comment: secret.encryptedComment
            ? secretManagerDecryptor({ cipherTextBlob: secret.encryptedComment }).toString()
            : ""
        })
      );

    const expandSecretReferences = expandSecretReferencesFactory({
      projectId,
      folderDAL,
      secretDAL,
      decryptSecretValue: (value) => (value ? secretManagerDecryptor({ cipherTextBlob: value }).toString() : undefined),
      canExpandValue: (expandEnvironment, expandSecretPath, expandSecretKey, expandSecretTags) =>
        permission.can(
          ProjectPermissionActions.Read,
          subject(ProjectPermissionSub.Secrets, {
            environment: expandEnvironment,
            secretPath: expandSecretPath,
            secretName: expandSecretKey,
            secretTags: expandSecretTags
          })
        )
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
      return {
        secrets: decryptedSecrets
      };
    }

    const secretImports = await secretImportDAL.findByFolderIds(paths.map((p) => p.folderId));
    const allowedImports = secretImports.filter(({ isReplication }) => !isReplication);
    const importedSecrets = await fnSecretsV2FromImports({
      secretImports: allowedImports,
      secretDAL,
      folderDAL,
      secretImportDAL,
      expandSecretReferences,
      decryptor: (value) => (value ? secretManagerDecryptor({ cipherTextBlob: value }).toString() : ""),
      hasSecretAccess: (expandEnvironment, expandSecretPath, expandSecretKey, expandSecretTags) =>
        permission.can(
          ProjectPermissionActions.Read,
          subject(ProjectPermissionSub.Secrets, {
            environment: expandEnvironment,
            secretPath: expandSecretPath,
            secretName: expandSecretKey,
            secretTags: expandSecretTags
          })
        )
    });

    return {
      secrets: decryptedSecrets,
      imports: importedSecrets
    };
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
    includeImports,
    expandSecretReferences: shouldExpandSecretReferences
  }: TGetASecretDTO) => {
    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );

    const folder = await folderDAL.findBySecretPath(projectId, environment, path);
    if (!folder)
      throw new NotFoundError({
        message: "Folder not found for the given environment slug & secret path",
        name: "Create secret"
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
          key: secretName,
          userId: secretType === SecretType.Personal ? actorId : null
        })
      : secretVersionDAL
          .findOne({
            folderId,
            type: secretType,
            userId: secretType === SecretType.Personal ? actorId : null,
            key: secretName
          })
          .then((el) =>
            SecretsV2Schema.extend({
              tags: z
                .object({ slug: z.string(), name: z.string(), id: z.string(), color: z.string() })
                .array()
                .default([])
                .optional()
            }).parse({
              ...el,
              id: el.secretId
            })
          ));

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Read,
      subject(ProjectPermissionSub.Secrets, {
        environment,
        secretPath: path,
        secretName,
        secretTags: (secret?.tags || []).map((el) => el.slug)
      })
    );

    const expandSecretReferences = expandSecretReferencesFactory({
      projectId,
      folderDAL,
      secretDAL,
      decryptSecretValue: (value) => (value ? secretManagerDecryptor({ cipherTextBlob: value }).toString() : undefined),
      canExpandValue: (expandEnvironment, expandSecretPath, expandSecretKey, expandSecretTags) =>
        permission.can(
          ProjectPermissionActions.Read,
          subject(ProjectPermissionSub.Secrets, {
            environment: expandEnvironment,
            secretPath: expandSecretPath,
            secretName: expandSecretKey,
            secretTags: expandSecretTags
          })
        )
    });

    // now if secret is not found
    // then search for imported secrets
    // here we consider the import order also thus starting from bottom
    if (!secret && includeImports) {
      const secretImports = await secretImportDAL.find({ folderId, isReplication: false });
      const importedSecrets = await fnSecretsV2FromImports({
        secretImports,
        secretDAL,
        folderDAL,
        secretImportDAL,
        decryptor: (value) => (value ? secretManagerDecryptor({ cipherTextBlob: value }).toString() : ""),
        expandSecretReferences: shouldExpandSecretReferences ? expandSecretReferences : undefined,
        hasSecretAccess: (expandEnvironment, expandSecretPath, expandSecretKey, expandSecretTags) =>
          permission.can(
            ProjectPermissionActions.Read,
            subject(ProjectPermissionSub.Secrets, {
              environment: expandEnvironment,
              secretPath: expandSecretPath,
              secretName: expandSecretKey,
              secretTags: expandSecretTags
            })
          )
      });

      for (let i = importedSecrets.length - 1; i >= 0; i -= 1) {
        for (let j = 0; j < importedSecrets[i].secrets.length; j += 1) {
          const importedSecret = importedSecrets[i].secrets[j];
          if (secretName === importedSecret.key) {
            return reshapeBridgeSecret(projectId, importedSecrets[i].environment, importedSecrets[i].secretPath, {
              ...importedSecret,
              value: importedSecret.secretValue || "",
              comment: importedSecret.secretComment || ""
            });
          }
        }
      }
    }
    if (!secret) throw new NotFoundError({ message: "Secret not found" });

    let secretValue = secret.encryptedValue
      ? secretManagerDecryptor({ cipherTextBlob: secret.encryptedValue }).toString()
      : "";
    if (shouldExpandSecretReferences && secretValue) {
      // eslint-disable-next-line
      const expandedSecretValue = await expandSecretReferences({
        environment,
        secretPath: path,
        value: secretValue,
        skipMultilineEncoding: secret.skipMultilineEncoding
      });
      secretValue = expandedSecretValue || "";
    }

    return reshapeBridgeSecret(projectId, environment, path, {
      ...secret,
      value: secretValue,
      comment: secret.encryptedComment
        ? secretManagerDecryptor({ cipherTextBlob: secret.encryptedComment }).toString()
        : ""
    });
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
    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );

    const folder = await folderDAL.findBySecretPath(projectId, environment, secretPath);
    if (!folder)
      throw new NotFoundError({
        message: "Folder not found for the given environment slug & secret path",
        name: "Create secret"
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
                  field: "key",
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
        ProjectPermissionActions.Create,
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
          const references = secretReferencesGroupByInputSecretKey[el.secretKey].nestedReferences;

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
            type: SecretType.Shared
          };
        }),
        folderId,
        secretDAL,
        secretVersionDAL,
        secretTagDAL,
        secretVersionTagDAL,
        tx
      })
    );

    await snapshotService.performSnapshot(folderId);
    await secretQueueService.syncSecrets({
      actor,
      actorId,
      secretPath,
      projectId,
      environmentSlug: folder.environment.slug
    });

    return newSecrets.map((el) =>
      reshapeBridgeSecret(projectId, environment, secretPath, {
        ...el,
        value: el.encryptedValue ? secretManagerDecryptor({ cipherTextBlob: el.encryptedValue }).toString() : "",
        comment: el.encryptedComment ? secretManagerDecryptor({ cipherTextBlob: el.encryptedComment }).toString() : ""
      })
    );
  };

  const updateManySecret = async ({
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    environment,
    projectId,
    secretPath,
    secrets: inputSecrets
  }: TUpdateManySecretDTO) => {
    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );

    const folder = await folderDAL.findBySecretPath(projectId, environment, secretPath);
    if (!folder)
      throw new NotFoundError({
        message: "Folder not found for the given environment slug & secret path",
        name: "Update secret"
      });
    const folderId = folder.id;

    const secretsToUpdate = await secretDAL.find({
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
                  field: "key",
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
    if (secretsToUpdate.length !== inputSecrets.length)
      throw new NotFoundError({ message: `Secret does not exist: ${secretsToUpdate.map((el) => el.key).join(",")}` });
    const secretsToUpdateInDBGroupedByKey = groupBy(secretsToUpdate, (i) => i.key);

    secretsToUpdate.forEach((el) => {
      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionActions.Edit,
        subject(ProjectPermissionSub.Secrets, {
          environment,
          secretPath,
          secretName: el.key,
          secretTags: el.tags.map((i) => i.slug)
        })
      );
    });

    // get all tags
    const sanitizedTagIds = inputSecrets.flatMap(({ tagIds = [] }) => tagIds);
    const tags = sanitizedTagIds.length ? await secretTagDAL.findManyTagsById(projectId, sanitizedTagIds) : [];
    if (tags.length !== sanitizedTagIds.length) throw new NotFoundError({ message: "Tag not found" });
    const tagsGroupByID = groupBy(tags, (i) => i.id);

    // check again to avoid non authorized tags are removed
    inputSecrets.forEach((el) => {
      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionActions.Edit,
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
    const secretsWithNewName = inputSecrets.filter(({ newSecretName }) => Boolean(newSecretName));
    if (secretsWithNewName.length) {
      const secrets = await secretDAL.find({
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
                    field: "key",
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
        throw new BadRequestError({
          message: `Secret with new name already exists: ${secretsWithNewName.map((el) => el.newSecretName).join(",")}`
        });

      secretsWithNewName.forEach((el) => {
        ForbiddenError.from(permission).throwUnlessCan(
          ProjectPermissionActions.Create,
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

    const secrets = await secretDAL.transaction(async (tx) =>
      fnSecretBulkUpdate({
        folderId,
        tx,
        inputSecrets: inputSecrets.map((el) => {
          const originalSecret = secretsToUpdateInDBGroupedByKey[el.secretKey][0];
          const encryptedValue =
            typeof el.secretValue !== "undefined"
              ? {
                  encryptedValue: secretManagerEncryptor({ plainText: Buffer.from(el.secretValue) }).cipherTextBlob,
                  references: secretReferencesGroupByInputSecretKey[el.secretKey].nestedReferences
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
              ...encryptedValue
            }
          };
        }),
        secretDAL,
        secretVersionDAL,
        secretTagDAL,
        secretVersionTagDAL
      })
    );
    await snapshotService.performSnapshot(folderId);
    await secretQueueService.syncSecrets({
      actor,
      actorId,
      secretPath,
      projectId,
      environmentSlug: folder.environment.slug
    });

    return secrets.map((el) =>
      reshapeBridgeSecret(projectId, environment, secretPath, {
        ...el,
        value: el.encryptedValue ? secretManagerDecryptor({ cipherTextBlob: el.encryptedValue }).toString() : "",
        comment: el.encryptedComment ? secretManagerDecryptor({ cipherTextBlob: el.encryptedComment }).toString() : ""
      })
    );
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
    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );

    const folder = await folderDAL.findBySecretPath(projectId, environment, secretPath);
    if (!folder)
      throw new NotFoundError({
        message: "Folder not found for the given environment slug & secret path",
        name: "Create secret"
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
                  field: "key",
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
        message: `One or more secrets does not exist: ${secretsToDelete.map((el) => el.key).join(",")}`
      });
    secretsToDelete.forEach((el) => {
      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionActions.Delete,
        subject(ProjectPermissionSub.Secrets, {
          environment,
          secretPath,
          secretName: el.key,
          secretTags: el.tags?.map((i) => i.slug)
        })
      );
    });

    const secretsDeleted = await secretDAL.transaction(async (tx) =>
      fnSecretBulkDelete({
        secretDAL,
        secretQueueService,
        inputSecrets: inputSecrets.map(({ type, secretKey }) => ({
          secretKey,
          type: type || SecretType.Shared
        })),
        projectId,
        folderId,
        actorId,
        tx
      })
    );

    // await snapshotService.performSnapshot(folderId);
    await secretQueueService.syncSecrets({
      actor,
      actorId,
      secretPath,
      projectId,
      environmentSlug: folder.environment.slug
    });

    const { decryptor: secretManagerDecryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId
    });
    return secretsDeleted.map((el) =>
      reshapeBridgeSecret(projectId, environment, secretPath, {
        ...el,
        value: el.encryptedValue ? secretManagerDecryptor({ cipherTextBlob: el.encryptedValue }).toString() : "",
        comment: el.encryptedComment ? secretManagerDecryptor({ cipherTextBlob: el.encryptedComment }).toString() : ""
      })
    );
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
    if (!secret) throw new NotFoundError({ message: "Failed to find secret" });

    const folder = await folderDAL.findById(secret.folderId);
    if (!folder) throw new NotFoundError({ message: "Failed to find secret" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      folder.projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.SecretRollback);
    const { decryptor: secretManagerDecryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId: folder.projectId
    });
    const secretVersions = await secretVersionDAL.find({ secretId }, { offset, limit, sort: [["createdAt", "desc"]] });
    return secretVersions.map((el) =>
      reshapeBridgeSecret(folder.projectId, folder.environment.envSlug, "/", {
        ...el,
        value: el.encryptedValue ? secretManagerDecryptor({ cipherTextBlob: el.encryptedValue }).toString() : "",
        comment: el.encryptedComment ? secretManagerDecryptor({ cipherTextBlob: el.encryptedComment }).toString() : ""
      })
    );
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
    const { hasRole } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );

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
    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );

    const sourceFolder = await folderDAL.findBySecretPath(projectId, sourceEnvironment, sourceSecretPath);
    if (!sourceFolder) {
      throw new NotFoundError({
        message: "Source path does not exist."
      });
    }

    const destinationFolder = await folderDAL.findBySecretPath(
      projectId,
      destinationEnvironment,
      destinationSecretPath
    );

    if (!destinationFolder) {
      throw new NotFoundError({
        message: "Destination path does not exist."
      });
    }

    const sourceSecrets = await secretDAL.find({
      type: SecretType.Shared,
      $in: {
        [`${TableName.SecretV2}.id` as "id"]: secretIds
      }
    });
    sourceSecrets.forEach((secret) => {
      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionActions.Delete,
        subject(ProjectPermissionSub.Secrets, {
          environment: sourceEnvironment,
          secretPath: sourceSecretPath,
          secretName: secret.key,
          secretTags: secret.tags.map((el) => el.slug)
        })
      );
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
        ForbiddenError.from(permission).throwUnlessCan(
          ProjectPermissionActions.Create,
          subject(ProjectPermissionSub.Secrets, {
            environment: destinationEnvironment,
            secretPath: destinationEnvironment,
            secretName: secret.key,
            secretTags: secret.tags.map((el) => el.slug)
          })
        );
      });

      locallyUpdatedSecrets.forEach((secret) => {
        ForbiddenError.from(permission).throwUnlessCan(
          ProjectPermissionActions.Edit,
          subject(ProjectPermissionSub.Secrets, {
            environment: destinationEnvironment,
            secretPath: destinationEnvironment,
            secretName: secret.key,
            secretTags: secret.tags.map((el) => el.slug)
          })
        );
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
            secretVersionDAL,
            secretDAL,
            tx,
            secretTagDAL,
            secretVersionTagDAL,
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
                references: doc.value ? getAllSecretReferences(doc.value).nestedReferences : []
              };
            })
          });
        }
        if (locallyUpdatedSecrets.length) {
          await fnSecretBulkUpdate({
            folderId: destinationFolder.id,
            secretVersionDAL,
            secretDAL,
            tx,
            secretTagDAL,
            secretVersionTagDAL,
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

    if (isDestinationUpdated) {
      await snapshotService.performSnapshot(destinationFolder.id);
      await secretQueueService.syncSecrets({
        projectId,
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
    getSecretsMultiEnv
  };
};
