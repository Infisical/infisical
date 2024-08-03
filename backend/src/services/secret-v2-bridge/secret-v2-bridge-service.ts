import { ForbiddenError, subject } from "@casl/ability";

import { ProjectMembershipRole, SecretsV2Schema, SecretType } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { TSecretApprovalPolicyServiceFactory } from "@app/ee/services/secret-approval-policy/secret-approval-policy-service";
import { TSecretApprovalRequestDALFactory } from "@app/ee/services/secret-approval-request/secret-approval-request-dal";
import { TSecretApprovalRequestSecretDALFactory } from "@app/ee/services/secret-approval-request/secret-approval-request-secret-dal";
import { TSecretSnapshotServiceFactory } from "@app/ee/services/secret-snapshot/secret-snapshot-service";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { groupBy } from "@app/lib/fn";
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
  getAllNestedSecretReferences,
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
  projectEnvDAL: Pick<TProjectEnvDALFactory, "findOne">;
  folderDAL: Pick<
    TSecretFolderDALFactory,
    "findBySecretPath" | "updateById" | "findById" | "findByManySecretPath" | "find"
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
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Create,
      subject(ProjectPermissionSub.Secrets, { environment, secretPath })
    );

    const folder = await folderDAL.findBySecretPath(projectId, environment, secretPath);
    if (!folder)
      throw new BadRequestError({
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
    if ((inputSecret.tagIds || []).length !== tags.length) throw new BadRequestError({ message: "Tag not found" });

    const { secretName, type, ...el } = inputSecret;
    const references = getAllNestedSecretReferences(inputSecret.secretValue);
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
            reminderRepeatDays: el.secretReminderRepeatDays,
            encryptedComment: setKnexStringValue(
              el.secretComment,
              (value) => secretManagerEncryptor({ plainText: Buffer.from(value) }).cipherTextBlob
            ),
            encryptedValue: el.secretValue
              ? secretManagerEncryptor({ plainText: Buffer.from(el.secretValue) }).cipherTextBlob
              : undefined,
            reminderNote: el.secretReminderNote,
            skipMultilineEncoding: el.skipMultilineEncoding,
            key: secretName,
            userId: inputSecret.type === SecretType.Personal ? actorId : null,
            tagIds: inputSecret.tagIds,
            references
          }
        ],
        secretDAL,
        secretVersionDAL,
        secretTagDAL,
        secretVersionTagDAL,
        tx
      })
    );

    await snapshotService.performSnapshot(folderId);
    await secretQueueService.syncSecrets({
      secretPath,
      actorId,
      actor,
      projectId,
      environmentSlug: folder.environment.slug
    });

    return reshapeBridgeSecret(projectId, environment, secretPath, {
      ...secret[0],
      value: inputSecret.secretValue,
      comment: inputSecret.secretComment
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
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Edit,
      subject(ProjectPermissionSub.Secrets, { environment, secretPath })
    );

    if (inputSecret.newSecretName === "") {
      throw new BadRequestError({ message: "New secret name cannot be empty" });
    }

    const folder = await folderDAL.findBySecretPath(projectId, environment, secretPath);
    if (!folder)
      throw new BadRequestError({
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
      if (!personalSecretToModify) throw new BadRequestError({ message: "Secret not found" });
      secretId = personalSecretToModify.id;
      secret = personalSecretToModify;
    } else {
      const sharedSecretToModify = await secretDAL.findOne({
        key: inputSecret.secretName,
        type: SecretType.Shared,
        folderId
      });
      if (!sharedSecretToModify) throw new BadRequestError({ message: "Secret not found" });
      secretId = sharedSecretToModify.id;
      secret = sharedSecretToModify;
    }

    if (inputSecret.newSecretName) {
      const doesNewNameSecretExist = await secretDAL.findOne({
        key: inputSecret.newSecretName,
        type: SecretType.Shared,
        folderId
      });
      if (doesNewNameSecretExist) throw new BadRequestError({ message: "Secret with the new name already exist" });
    }

    // validate tags
    // fetch all tags and if not same count throw error meaning one was invalid tags
    const tags = inputSecret.tagIds ? await secretTagDAL.find({ projectId, $in: { id: inputSecret.tagIds } }) : [];
    if ((inputSecret.tagIds || []).length !== tags.length) throw new BadRequestError({ message: "Tag not found" });

    const { secretName, secretValue } = inputSecret;

    const { encryptor: secretManagerEncryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId
    });
    const encryptedValue =
      typeof secretValue !== "undefined"
        ? {
            encryptedValue: secretManagerEncryptor({ plainText: Buffer.from(secretValue) }).cipherTextBlob,
            references: getAllNestedSecretReferences(secretValue)
          }
        : {};

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

    await snapshotService.performSnapshot(folderId);
    await secretQueueService.syncSecrets({
      actor,
      actorId,
      secretPath,
      projectId,
      environmentSlug: folder.environment.slug
    });
    return reshapeBridgeSecret(projectId, environment, secretPath, {
      ...updatedSecret[0],
      value: inputSecret.secretValue,
      comment: inputSecret.secretComment
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
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Delete,
      subject(ProjectPermissionSub.Secrets, { environment, secretPath })
    );

    const folder = await folderDAL.findBySecretPath(projectId, environment, secretPath);
    if (!folder)
      throw new BadRequestError({
        message: "Folder not found for the given environment slug & secret path",
        name: "Delete secret"
      });
    const folderId = folder.id;

    if (ActorType.USER !== actor && inputSecret.type === SecretType.Personal) {
      throw new BadRequestError({ message: "Must be user to delete personal secret" });
    }

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

    await snapshotService.performSnapshot(folderId);
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
    return reshapeBridgeSecret(projectId, environment, secretPath, {
      ...deletedSecret[0],
      value: deletedSecret[0].encryptedValue
        ? secretManagerDecryptor({ cipherTextBlob: deletedSecret[0].encryptedValue }).toString()
        : undefined,
      comment: deletedSecret[0].encryptedComment
        ? secretManagerDecryptor({ cipherTextBlob: deletedSecret[0].encryptedComment }).toString()
        : undefined
    });
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
    expandSecretReferences: shouldExpandSecretReferences
  }: TGetSecretsDTO) => {
    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );

    let paths: { folderId: string; path: string }[] = [];

    if (recursive) {
      const deepPaths = await recursivelyGetSecretPaths({
        folderDAL,
        projectEnvDAL,
        projectId,
        environment,
        currentPath: path,
        hasAccess: (permissionEnvironment, permissionSecretPath) =>
          permission.can(
            ProjectPermissionActions.Read,
            subject(ProjectPermissionSub.Secrets, {
              environment: permissionEnvironment,
              secretPath: permissionSecretPath
            })
          )
      });

      if (!deepPaths) return { secrets: [], imports: [] };

      paths = deepPaths.map(({ folderId, path: p }) => ({ folderId, path: p }));
    } else {
      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionActions.Read,
        subject(ProjectPermissionSub.Secrets, { environment, secretPath: path })
      );

      const folder = await folderDAL.findBySecretPath(projectId, environment, path);
      if (!folder) return { secrets: [], imports: [] };

      paths = [{ folderId: folder.id, path }];
    }

    const groupedPaths = groupBy(paths, (p) => p.folderId);

    const secrets = await secretDAL.findByFolderIds(
      paths.map((p) => p.folderId),
      actorId
    );

    const { decryptor: secretManagerDecryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId
    });

    const decryptedSecrets = secrets.map((secret) =>
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
      decryptSecretValue: (value) => (value ? secretManagerDecryptor({ cipherTextBlob: value }).toString() : undefined)
    });

    if (shouldExpandSecretReferences) {
      const secretsGroupByPath = groupBy(decryptedSecrets, (i) => i.secretPath);
      for (const secretPathKey in secretsGroupByPath) {
        if (Object.hasOwn(secretsGroupByPath, secretPathKey)) {
          const secretsGroupByKey = secretsGroupByPath[secretPathKey].reduce(
            (acc, item) => {
              acc[item.secretKey] = {
                value: item.secretValue,
                comment: item.secretComment,
                skipMultilineEncoding: item.skipMultilineEncoding
              };
              return acc;
            },
            {} as Record<string, { value?: string; comment?: string; skipMultilineEncoding?: boolean | null }>
          );
          // eslint-disable-next-line
          await expandSecretReferences(secretsGroupByKey);
          secretsGroupByPath[secretPathKey].forEach((decryptedSecret) => {
            // eslint-disable-next-line no-param-reassign
            decryptedSecret.secretValue = secretsGroupByKey[decryptedSecret.secretKey].value;
          });
        }
      }
    }

    if (!includeImports) {
      return {
        secrets: decryptedSecrets
      };
    }

    const secretImports = await secretImportDAL.findByFolderIds(paths.map((p) => p.folderId));
    const allowedImports = secretImports.filter(({ importEnv, importPath, isReplication }) =>
      !isReplication &&
      // if its service token allow full access over imported one
      actor === ActorType.SERVICE
        ? true
        : permission.can(
            ProjectPermissionActions.Read,
            subject(ProjectPermissionSub.Secrets, {
              environment: importEnv.slug,
              secretPath: importPath
            })
          )
    );
    const importedSecrets = await fnSecretsV2FromImports({
      allowedImports,
      secretDAL,
      folderDAL,
      secretImportDAL,
      expandSecretReferences,
      decryptor: (value) => (value ? secretManagerDecryptor({ cipherTextBlob: value }).toString() : undefined)
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
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Read,
      subject(ProjectPermissionSub.Secrets, { environment, secretPath: path })
    );
    const folder = await folderDAL.findBySecretPath(projectId, environment, path);
    if (!folder)
      throw new BadRequestError({
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
          .then((el) => SecretsV2Schema.parse({ ...el, id: el.secretId })));

    const expandSecretReferences = expandSecretReferencesFactory({
      projectId,
      folderDAL,
      secretDAL,
      decryptSecretValue: (value) => (value ? secretManagerDecryptor({ cipherTextBlob: value }).toString() : undefined)
    });

    // now if secret is not found
    // then search for imported secrets
    // here we consider the import order also thus starting from bottom
    if (!secret && includeImports) {
      const secretImports = await secretImportDAL.find({ folderId, isReplication: false });
      const allowedImports = secretImports.filter(({ importEnv, importPath }) =>
        // if its service token allow full access over imported one
        actor === ActorType.SERVICE
          ? true
          : permission.can(
              ProjectPermissionActions.Read,
              subject(ProjectPermissionSub.Secrets, {
                environment: importEnv.slug,
                secretPath: importPath
              })
            )
      );
      const importedSecrets = await fnSecretsV2FromImports({
        allowedImports,
        secretDAL,
        folderDAL,
        secretImportDAL,
        decryptor: (value) => (value ? secretManagerDecryptor({ cipherTextBlob: value }).toString() : undefined),
        expandSecretReferences: shouldExpandSecretReferences ? expandSecretReferences : undefined
      });

      for (let i = importedSecrets.length - 1; i >= 0; i -= 1) {
        for (let j = 0; j < importedSecrets[i].secrets.length; j += 1) {
          const importedSecret = importedSecrets[i].secrets[j];
          if (secretName === importedSecret.key) {
            return reshapeBridgeSecret(
              projectId,
              importedSecrets[i].environment,
              importedSecrets[i].secretPath,
              importedSecret
            );
          }
        }
      }
    }
    if (!secret) throw new BadRequestError({ message: "Secret not found" });

    let secretValue = secret.encryptedValue
      ? secretManagerDecryptor({ cipherTextBlob: secret.encryptedValue }).toString()
      : undefined;
    if (shouldExpandSecretReferences && secretValue) {
      const secretReferenceExpandedRecord = {
        [secret.key]: { value: secretValue }
      };
      // eslint-disable-next-line
      await expandSecretReferences(secretReferenceExpandedRecord);
      secretValue = secretReferenceExpandedRecord[secret.key].value;
    }

    return reshapeBridgeSecret(projectId, environment, path, {
      ...secret,
      value: secretValue,
      comment: secret.encryptedComment
        ? secretManagerDecryptor({ cipherTextBlob: secret.encryptedComment }).toString()
        : undefined
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
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Create,
      subject(ProjectPermissionSub.Secrets, { environment, secretPath })
    );

    const folder = await folderDAL.findBySecretPath(projectId, environment, secretPath);
    if (!folder)
      throw new BadRequestError({
        message: "Folder not found for the given environment slug & secret path",
        name: "Create secret"
      });
    const folderId = folder.id;

    const secrets = await secretDAL.findBySecretKeys(
      folderId,
      inputSecrets.map((el) => ({
        key: el.secretKey,
        type: SecretType.Shared
      }))
    );
    if (secrets.length)
      throw new BadRequestError({ message: `Secret already exist: ${secrets.map((el) => el.key).join(",")}` });

    // get all tags
    const sanitizedTagIds = inputSecrets.flatMap(({ tagIds = [] }) => tagIds);
    const tags = sanitizedTagIds.length ? await secretTagDAL.findManyTagsById(projectId, sanitizedTagIds) : [];
    if (tags.length !== sanitizedTagIds.length) throw new BadRequestError({ message: "Tag not found" });

    const { encryptor: secretManagerEncryptor, decryptor: secretManagerDecryptor } =
      await kmsService.createCipherPairWithDataKey({ type: KmsDataKey.SecretManager, projectId });

    const newSecrets = await secretDAL.transaction(async (tx) =>
      fnSecretBulkInsert({
        inputSecrets: inputSecrets.map((el) => ({
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
          references: getAllNestedSecretReferences(el.secretValue),
          type: SecretType.Shared
        })),
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
        value: el.encryptedValue ? secretManagerDecryptor({ cipherTextBlob: el.encryptedValue }).toString() : undefined,
        comment: el.encryptedComment
          ? secretManagerDecryptor({ cipherTextBlob: el.encryptedComment }).toString()
          : undefined
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
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Edit,
      subject(ProjectPermissionSub.Secrets, { environment, secretPath })
    );

    const folder = await folderDAL.findBySecretPath(projectId, environment, secretPath);
    if (!folder)
      throw new BadRequestError({
        message: "Folder not found for the given environment slug & secret path",
        name: "Update secret"
      });
    const folderId = folder.id;

    const secretsToUpdate = await secretDAL.findBySecretKeys(
      folderId,
      inputSecrets.map((el) => ({
        key: el.secretKey,
        type: SecretType.Shared
      }))
    );
    if (secretsToUpdate.length !== inputSecrets.length)
      throw new BadRequestError({ message: `Secret not exist: ${secretsToUpdate.map((el) => el.key).join(",")}` });
    const secretsToUpdateInDBGroupedByKey = groupBy(secretsToUpdate, (i) => i.key);

    // now find any secret that needs to update its name
    // same process as above
    const secretsWithNewName = inputSecrets.filter(({ newSecretName }) => Boolean(newSecretName));
    if (secretsWithNewName.length) {
      const secrets = await secretDAL.findBySecretKeys(
        folderId,
        secretsWithNewName.map((el) => ({
          key: el.newSecretName as string,
          type: SecretType.Shared
        }))
      );
      if (secrets.length)
        throw new BadRequestError({
          message: `Secret with new name exist: ${secretsWithNewName.map((el) => el.newSecretName).join(",")}`
        });
    }

    // get all tags
    const sanitizedTagIds = inputSecrets.flatMap(({ tagIds = [] }) => tagIds);
    const tags = sanitizedTagIds.length ? await secretTagDAL.findManyTagsById(projectId, sanitizedTagIds) : [];
    if (tags.length !== sanitizedTagIds.length) throw new BadRequestError({ message: "Tag not found" });

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
                  references: getAllNestedSecretReferences(el.secretValue)
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
        value: el.encryptedValue ? secretManagerDecryptor({ cipherTextBlob: el.encryptedValue }).toString() : undefined,
        comment: el.encryptedComment
          ? secretManagerDecryptor({ cipherTextBlob: el.encryptedComment }).toString()
          : undefined
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
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Delete,
      subject(ProjectPermissionSub.Secrets, { environment, secretPath })
    );

    const folder = await folderDAL.findBySecretPath(projectId, environment, secretPath);
    if (!folder)
      throw new BadRequestError({
        message: "Folder not found for the given environment slug & secret path",
        name: "Create secret"
      });
    const folderId = folder.id;

    const secretsToDelete = await secretDAL.findBySecretKeys(
      folderId,
      inputSecrets.map((el) => ({
        key: el.secretKey,
        type: SecretType.Shared
      }))
    );
    if (secretsToDelete.length !== inputSecrets.length)
      throw new BadRequestError({ message: `Secret not exist: ${secretsToDelete.map((el) => el.key).join(",")}` });

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
        value: el.encryptedValue ? secretManagerDecryptor({ cipherTextBlob: el.encryptedValue }).toString() : undefined,
        comment: el.encryptedComment
          ? secretManagerDecryptor({ cipherTextBlob: el.encryptedComment }).toString()
          : undefined
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
    if (!secret) throw new BadRequestError({ message: "Failed to find secret" });

    const folder = await folderDAL.findById(secret.folderId);
    if (!folder) throw new BadRequestError({ message: "Failed to find secret" });

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
        value: el.encryptedValue ? secretManagerDecryptor({ cipherTextBlob: el.encryptedValue }).toString() : undefined,
        comment: el.encryptedComment
          ? secretManagerDecryptor({ cipherTextBlob: el.encryptedComment }).toString()
          : undefined
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
      throw new BadRequestError({ message: "Only admins are allowed to take this action" });

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
              ? getAllNestedSecretReferences(secretManagerDecryptor({ cipherTextBlob: encryptedValue }).toString())
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

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Delete,
      subject(ProjectPermissionSub.Secrets, { environment: sourceEnvironment, secretPath: sourceSecretPath })
    );

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Create,
      subject(ProjectPermissionSub.Secrets, { environment: destinationEnvironment, secretPath: destinationSecretPath })
    );

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Edit,
      subject(ProjectPermissionSub.Secrets, { environment: destinationEnvironment, secretPath: destinationSecretPath })
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
        id: secretIds
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
                references: doc.value ? getAllNestedSecretReferences(doc.value) : []
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
                        references: doc.value ? getAllNestedSecretReferences(doc.value) : []
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
    moveSecrets
  };
};
