/* eslint-disable no-unreachable-loop */
/* eslint-disable no-await-in-loop */
import { ForbiddenError, subject } from "@casl/ability";

import {
  ProjectMembershipRole,
  ProjectUpgradeStatus,
  SecretEncryptionAlgo,
  SecretKeyEncoding,
  SecretsSchema,
  SecretType
} from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { TSecretApprovalPolicyServiceFactory } from "@app/ee/services/secret-approval-policy/secret-approval-policy-service";
import { TSecretApprovalRequestDALFactory } from "@app/ee/services/secret-approval-request/secret-approval-request-dal";
import { TSecretApprovalRequestSecretDALFactory } from "@app/ee/services/secret-approval-request/secret-approval-request-secret-dal";
import { TSecretApprovalRequestServiceFactory } from "@app/ee/services/secret-approval-request/secret-approval-request-service";
import { TSecretSnapshotServiceFactory } from "@app/ee/services/secret-snapshot/secret-snapshot-service";
import { getConfig } from "@app/lib/config/env";
import {
  buildSecretBlindIndexFromName,
  decryptSymmetric128BitHexKeyUTF8,
  encryptSymmetric128BitHexKeyUTF8
} from "@app/lib/crypto";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { groupBy, pick } from "@app/lib/fn";
import { logger } from "@app/lib/logger";
import { alphaNumericNanoId } from "@app/lib/nanoid";

import { ActorType } from "../auth/auth-type";
import { TProjectDALFactory } from "../project/project-dal";
import { TProjectBotServiceFactory } from "../project-bot/project-bot-service";
import { TProjectEnvDALFactory } from "../project-env/project-env-dal";
import { TSecretBlindIndexDALFactory } from "../secret-blind-index/secret-blind-index-dal";
import { TSecretFolderDALFactory } from "../secret-folder/secret-folder-dal";
import { TSecretImportDALFactory } from "../secret-import/secret-import-dal";
import { fnSecretsFromImports } from "../secret-import/secret-import-fns";
import { TSecretTagDALFactory } from "../secret-tag/secret-tag-dal";
import { TSecretV2BridgeServiceFactory } from "../secret-v2-bridge/secret-v2-bridge-service";
import { TSecretDALFactory } from "./secret-dal";
import {
  decryptSecretRaw,
  fnSecretBlindIndexCheck,
  fnSecretBulkDelete,
  fnSecretBulkInsert,
  fnSecretBulkUpdate,
  getAllNestedSecretReferences,
  interpolateSecrets,
  recursivelyGetSecretPaths
} from "./secret-fns";
import { TSecretQueueFactory } from "./secret-queue";
import {
  SecretOperations,
  SecretProtectionType,
  TAttachSecretTagsDTO,
  TBackFillSecretReferencesDTO,
  TCreateBulkSecretDTO,
  TCreateManySecretRawDTO,
  TCreateSecretDTO,
  TCreateSecretRawDTO,
  TDeleteBulkSecretDTO,
  TDeleteManySecretRawDTO,
  TDeleteSecretDTO,
  TDeleteSecretRawDTO,
  TGetASecretDTO,
  TGetASecretRawDTO,
  TGetSecretsDTO,
  TGetSecretsRawDTO,
  TGetSecretVersionsDTO,
  TMoveSecretsDTO,
  TStartSecretsV2MigrationDTO,
  TUpdateBulkSecretDTO,
  TUpdateManySecretRawDTO,
  TUpdateSecretDTO,
  TUpdateSecretRawDTO
} from "./secret-types";
import { TSecretVersionDALFactory } from "./secret-version-dal";
import { TSecretVersionTagDALFactory } from "./secret-version-tag-dal";

type TSecretServiceFactoryDep = {
  secretDAL: TSecretDALFactory;
  secretTagDAL: TSecretTagDALFactory;
  secretVersionDAL: TSecretVersionDALFactory;
  projectDAL: Pick<TProjectDALFactory, "checkProjectUpgradeStatus" | "findProjectBySlug">;
  projectEnvDAL: Pick<TProjectEnvDALFactory, "findOne">;
  folderDAL: Pick<
    TSecretFolderDALFactory,
    "findBySecretPath" | "updateById" | "findById" | "findByManySecretPath" | "find"
  >;
  secretV2BridgeService: TSecretV2BridgeServiceFactory;
  secretBlindIndexDAL: TSecretBlindIndexDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  snapshotService: Pick<TSecretSnapshotServiceFactory, "performSnapshot">;
  secretQueueService: Pick<
    TSecretQueueFactory,
    "syncSecrets" | "handleSecretReminder" | "removeSecretReminder" | "startSecretV2Migration"
  >;
  projectBotService: Pick<TProjectBotServiceFactory, "getBotKey">;
  secretImportDAL: Pick<TSecretImportDALFactory, "find" | "findByFolderIds">;
  secretVersionTagDAL: Pick<TSecretVersionTagDALFactory, "insertMany">;
  secretApprovalPolicyService: Pick<TSecretApprovalPolicyServiceFactory, "getSecretApprovalPolicy">;
  secretApprovalRequestService: Pick<
    TSecretApprovalRequestServiceFactory,
    "generateSecretApprovalRequest" | "generateSecretApprovalRequestV2Bridge"
  >;
  secretApprovalRequestDAL: Pick<TSecretApprovalRequestDALFactory, "create" | "transaction">;
  secretApprovalRequestSecretDAL: Pick<
    TSecretApprovalRequestSecretDALFactory,
    "insertMany" | "insertApprovalSecretTags"
  >;
};

export type TSecretServiceFactory = ReturnType<typeof secretServiceFactory>;
export const secretServiceFactory = ({
  secretDAL,
  projectEnvDAL,
  secretTagDAL,
  secretVersionDAL,
  folderDAL,
  secretBlindIndexDAL,
  permissionService,
  snapshotService,
  secretQueueService,
  projectDAL,
  projectBotService,
  secretImportDAL,
  secretVersionTagDAL,
  secretApprovalPolicyService,
  secretApprovalRequestDAL,
  secretApprovalRequestSecretDAL,
  secretV2BridgeService,
  secretApprovalRequestService
}: TSecretServiceFactoryDep) => {
  const getSecretReference = async (projectId: string) => {
    // if bot key missing means e2e still exist
    const projectBot = await projectBotService.getBotKey(projectId).catch(() => null);
    return (el: { ciphertext?: string; iv: string; tag: string }) =>
      projectBot?.botKey
        ? getAllNestedSecretReferences(
            decryptSymmetric128BitHexKeyUTF8({
              ciphertext: el.ciphertext || "",
              iv: el.iv,
              tag: el.tag,
              key: projectBot.botKey
            })
          )
        : undefined;
  };

  // utility function to get secret blind index data
  const interalGenSecBlindIndexByName = async (projectId: string, secretName: string) => {
    const appCfg = getConfig();

    const secretBlindIndexDoc = await secretBlindIndexDAL.findOne({ projectId });
    if (!secretBlindIndexDoc) throw new BadRequestError({ message: "Blind index not found", name: "Create secret" });

    const secretBlindIndex = await buildSecretBlindIndexFromName({
      secretName,
      keyEncoding: secretBlindIndexDoc.keyEncoding as SecretKeyEncoding,
      rootEncryptionKey: appCfg.ROOT_ENCRYPTION_KEY,
      encryptionKey: appCfg.ENCRYPTION_KEY,
      tag: secretBlindIndexDoc.saltTag,
      ciphertext: secretBlindIndexDoc.encryptedSaltCipherText,
      iv: secretBlindIndexDoc.saltIV
    });
    if (!secretBlindIndex) throw new BadRequestError({ message: "Secret not found" });
    return secretBlindIndex;
  };

  const createSecret = async ({
    path,
    actor,
    actorId,
    actorOrgId,
    environment,
    actorAuthMethod,
    projectId,
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
      subject(ProjectPermissionSub.Secrets, { environment, secretPath: path })
    );

    await projectDAL.checkProjectUpgradeStatus(projectId);

    const folder = await folderDAL.findBySecretPath(projectId, environment, path);
    if (!folder)
      throw new BadRequestError({
        message: "Folder not found for the given environment slug & secret path",
        name: "Create secret"
      });
    const folderId = folder.id;

    const blindIndexCfg = await secretBlindIndexDAL.findOne({ projectId });
    if (!blindIndexCfg) throw new BadRequestError({ message: "Blind index not found", name: "CreateSecret" });

    if (ActorType.USER !== actor && inputSecret.type === SecretType.Personal) {
      throw new BadRequestError({ message: "Must be user to create personal secret" });
    }

    const { keyName2BlindIndex } = await fnSecretBlindIndexCheck({
      inputSecrets: [{ secretName: inputSecret.secretName, type: inputSecret.type as SecretType }],
      folderId,
      isNew: true,
      userId: actorId,
      blindIndexCfg,
      secretDAL
    });

    // if user creating personal check its shared also exist
    if (inputSecret.type === SecretType.Personal) {
      const sharedExist = await secretDAL.findOne({
        secretBlindIndex: keyName2BlindIndex[inputSecret.secretName],
        folderId,
        type: SecretType.Shared
      });
      if (!sharedExist)
        throw new BadRequestError({
          message: "Failed to create personal secret override for no corresponding shared secret"
        });
    }

    // validate tags
    // fetch all tags and if not same count throw error meaning one was invalid tags
    const tags = inputSecret.tags ? await secretTagDAL.findManyTagsById(projectId, inputSecret.tags) : [];
    if ((inputSecret.tags || []).length !== tags.length) throw new BadRequestError({ message: "Tag not found" });

    const { secretName, type, ...el } = inputSecret;
    const references = await getSecretReference(projectId);
    const secret = await secretDAL.transaction((tx) =>
      fnSecretBulkInsert({
        folderId,
        inputSecrets: [
          {
            version: 1,
            secretBlindIndex: keyName2BlindIndex[secretName],
            type,
            ...el,
            userId: inputSecret.type === SecretType.Personal ? actorId : null,
            algorithm: SecretEncryptionAlgo.AES_256_GCM,
            keyEncoding: SecretKeyEncoding.UTF8,
            tags: inputSecret.tags,
            references: references({
              ciphertext: inputSecret.secretValueCiphertext,
              iv: inputSecret.secretValueIV,
              tag: inputSecret.secretValueTag
            })
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
      secretPath: path,
      actorId,
      actor,
      projectId,
      environmentSlug: folder.environment.slug
    });
    return { ...secret[0], environment, workspace: projectId, tags, secretPath: path };
  };

  const updateSecret = async ({
    path,
    actor,
    actorId,
    actorOrgId,
    environment,
    actorAuthMethod,
    projectId,
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
      subject(ProjectPermissionSub.Secrets, { environment, secretPath: path })
    );

    await projectDAL.checkProjectUpgradeStatus(projectId);

    if (inputSecret.newSecretName === "") {
      throw new BadRequestError({ message: "New secret name cannot be empty" });
    }

    const folder = await folderDAL.findBySecretPath(projectId, environment, path);
    if (!folder)
      throw new BadRequestError({
        message: "Folder not found for the given environment slug & secret path",
        name: "Create secret"
      });
    const folderId = folder.id;

    const blindIndexCfg = await secretBlindIndexDAL.findOne({ projectId });
    if (!blindIndexCfg) throw new BadRequestError({ message: "Blind index not found", name: "CreateSecret" });

    if (ActorType.USER !== actor && inputSecret.type === SecretType.Personal) {
      throw new BadRequestError({ message: "Must be user to create personal secret" });
    }

    const { secrets, keyName2BlindIndex } = await fnSecretBlindIndexCheck({
      inputSecrets: [{ secretName: inputSecret.secretName, type: inputSecret.type as SecretType }],
      folderId,
      isNew: false,
      blindIndexCfg,
      userId: actorId,
      secretDAL
    });
    if (inputSecret.newSecretName && inputSecret.type === SecretType.Personal) {
      throw new BadRequestError({ message: "Personal secret cannot change the key name" });
    }

    let newSecretNameBlindIndex: string | undefined;
    if (inputSecret?.newSecretName) {
      const { keyName2BlindIndex: kN2NewBlindIndex } = await fnSecretBlindIndexCheck({
        inputSecrets: [{ secretName: inputSecret.newSecretName }],
        folderId,
        isNew: true,
        blindIndexCfg,
        secretDAL
      });
      newSecretNameBlindIndex = kN2NewBlindIndex[inputSecret.newSecretName];
    }

    await secretQueueService.handleSecretReminder({
      newSecret: {
        id: secrets[0].id,
        ...inputSecret
      },
      oldSecret: secrets[0],
      projectId
    });

    const tags = inputSecret.tags ? await secretTagDAL.findManyTagsById(projectId, inputSecret.tags) : [];
    if ((inputSecret.tags || []).length !== tags.length) throw new BadRequestError({ message: "Tag not found" });

    const { secretName, ...el } = inputSecret;

    const references = await getSecretReference(projectId);
    const updatedSecret = await secretDAL.transaction(async (tx) =>
      fnSecretBulkUpdate({
        folderId,
        projectId,
        inputSecrets: [
          {
            filter: { id: secrets[0].id },
            data: {
              ...pick(el, [
                "type",
                "secretCommentCiphertext",
                "secretCommentTag",
                "secretCommentIV",
                "secretValueIV",
                "secretValueTag",
                "secretValueCiphertext",
                "secretKeyCiphertext",
                "secretKeyTag",
                "secretKeyIV",
                "metadata",
                "skipMultilineEncoding",
                "secretReminderNote",
                "secretReminderRepeatDays",
                "tags"
              ]),
              secretBlindIndex: newSecretNameBlindIndex || keyName2BlindIndex[secretName],
              references: references({
                ciphertext: inputSecret.secretValueCiphertext,
                iv: inputSecret.secretValueIV,
                tag: inputSecret.secretValueTag
              })
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

    await snapshotService.performSnapshot(folderId);
    await secretQueueService.syncSecrets({
      actor,
      actorId,
      secretPath: path,
      projectId,
      environmentSlug: folder.environment.slug
    });
    return { ...updatedSecret[0], workspace: projectId, environment, secretPath: path };
  };

  const deleteSecret = async ({
    path,
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    environment,
    projectId,
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
      subject(ProjectPermissionSub.Secrets, { environment, secretPath: path })
    );

    await projectDAL.checkProjectUpgradeStatus(projectId);

    const folder = await folderDAL.findBySecretPath(projectId, environment, path);
    if (!folder)
      throw new BadRequestError({
        message: "Folder not found for the given environment slug & secret path",
        name: "Create secret"
      });
    const folderId = folder.id;

    const blindIndexCfg = await secretBlindIndexDAL.findOne({ projectId });
    if (!blindIndexCfg) throw new BadRequestError({ message: "Blind index not found", name: "CreateSecret" });

    if (ActorType.USER !== actor && inputSecret.type === SecretType.Personal) {
      throw new BadRequestError({ message: "Must be user to create personal secret" });
    }

    const { keyName2BlindIndex } = await fnSecretBlindIndexCheck({
      inputSecrets: [{ secretName: inputSecret.secretName }],
      folderId,
      isNew: false,
      blindIndexCfg,
      secretDAL
    });

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
            secretBlindIndex: keyName2BlindIndex[inputSecret.secretName]
          }
        ],
        tx
      })
    );

    await snapshotService.performSnapshot(folderId);
    await secretQueueService.syncSecrets({
      actor,
      actorId,
      secretPath: path,
      projectId,
      environmentSlug: folder.environment.slug
    });
    // TODO(akhilmhdh-pg): license check, posthog service and snapshot
    return { ...deletedSecret[0], _id: deletedSecret[0].id, workspace: projectId, environment, secretPath: path };
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
    recursive
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
      const getPaths = recursivelyGetSecretPaths({
        permissionService,
        folderDAL,
        projectEnvDAL
      });

      const deepPaths = await getPaths({
        projectId,
        environment,
        currentPath: path,
        auth: {
          actor,
          actorId,
          actorAuthMethod,
          actorOrgId
        }
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

    if (includeImports) {
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
      const importedSecrets = await fnSecretsFromImports({
        allowedImports,
        secretDAL,
        folderDAL,
        secretImportDAL
      });

      return {
        secrets: secrets.map((secret) => ({
          ...secret,
          workspace: projectId,
          environment,
          secretPath: groupedPaths[secret.folderId][0].path
        })),
        imports: importedSecrets
      };
    }

    return {
      secrets: secrets.map((secret) => ({
        ...secret,
        workspace: projectId,
        environment,
        secretPath: groupedPaths[secret.folderId][0].path
      }))
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
    includeImports
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

    const secretBlindIndex = await interalGenSecBlindIndexByName(projectId, secretName);

    // Case: The old python SDK uses incorrect logic https://github.com/Infisical/infisical-python/blob/main/infisical/client/infisicalclient.py#L89.
    // Fetch secrets using service tokens cannot fetch personal secrets, only shared.
    // The mongo backend used to correct this mistake, this line also adds it to current backend
    // Mongo backend check: https://github.com/Infisical/infisical-mongo/blob/main/backend/src/helpers/secrets.ts#L658
    let secretType = type;
    if (actor === ActorType.SERVICE) {
      logger.info(
        `secretServiceFactory: overriding secret type for service token [projectId=${projectId}] [factoryFunctionName=getSecretByName]`
      );
      secretType = SecretType.Shared;
    }

    const secret = await (version === undefined
      ? secretDAL.findOneWithTags({
          folderId,
          type: secretType,
          userId: secretType === SecretType.Personal ? actorId : null,
          secretBlindIndex
        })
      : secretVersionDAL
          .findOne({
            folderId,
            type: secretType,
            userId: secretType === SecretType.Personal ? actorId : null,
            secretBlindIndex
          })
          .then((el) => SecretsSchema.parse({ ...el, id: el.secretId })));
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
      const importedSecrets = await fnSecretsFromImports({
        allowedImports,
        secretDAL,
        folderDAL,
        secretImportDAL
      });
      for (let i = importedSecrets.length - 1; i >= 0; i -= 1) {
        for (let j = 0; j < importedSecrets[i].secrets.length; j += 1) {
          if (secretBlindIndex === importedSecrets[i].secrets[j].secretBlindIndex) {
            return {
              ...importedSecrets[i].secrets[j],
              workspace: projectId,
              environment: importedSecrets[i].environment,
              secretPath: importedSecrets[i].secretPath
            };
          }
        }
      }
    }
    if (!secret) throw new BadRequestError({ message: "Secret not found" });

    return { ...secret, workspace: projectId, environment, secretPath: path };
  };

  const createManySecret = async ({
    path,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    environment,
    projectId,
    secrets: inputSecrets
  }: TCreateBulkSecretDTO) => {
    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Create,
      subject(ProjectPermissionSub.Secrets, { environment, secretPath: path })
    );

    await projectDAL.checkProjectUpgradeStatus(projectId);

    const folder = await folderDAL.findBySecretPath(projectId, environment, path);
    if (!folder)
      throw new BadRequestError({
        message: "Folder not found for the given environment slug & secret path",
        name: "Create secret"
      });
    const folderId = folder.id;

    const blindIndexCfg = await secretBlindIndexDAL.findOne({ projectId });
    if (!blindIndexCfg) throw new BadRequestError({ message: "Blind index not found", name: "Create secret" });

    const { keyName2BlindIndex } = await fnSecretBlindIndexCheck({
      inputSecrets,
      folderId,
      isNew: true,
      blindIndexCfg,
      secretDAL
    });

    // get all tags
    const tagIds = inputSecrets.flatMap(({ tags = [] }) => tags);
    const tags = tagIds.length ? await secretTagDAL.findManyTagsById(projectId, tagIds) : [];
    if (tags.length !== tagIds.length) throw new BadRequestError({ message: "Tag not found" });

    const references = await getSecretReference(projectId);
    const newSecrets = await secretDAL.transaction(async (tx) =>
      fnSecretBulkInsert({
        inputSecrets: inputSecrets.map(({ secretName, ...el }) => ({
          ...el,
          version: 0,
          secretBlindIndex: keyName2BlindIndex[secretName],
          type: SecretType.Shared,
          algorithm: SecretEncryptionAlgo.AES_256_GCM,
          keyEncoding: SecretKeyEncoding.UTF8,
          references: references({
            ciphertext: el.secretValueCiphertext,
            iv: el.secretValueIV,
            tag: el.secretValueTag
          })
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
      secretPath: path,
      projectId,
      environmentSlug: folder.environment.slug
    });

    return newSecrets;
  };

  const updateManySecret = async ({
    path,
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    environment,
    projectId,
    secrets: inputSecrets
  }: TUpdateBulkSecretDTO) => {
    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Edit,
      subject(ProjectPermissionSub.Secrets, { environment, secretPath: path })
    );

    await projectDAL.checkProjectUpgradeStatus(projectId);

    const folder = await folderDAL.findBySecretPath(projectId, environment, path);
    if (!folder)
      throw new BadRequestError({
        message: "Folder not found for the given environment slug & secret path",
        name: "Update secret"
      });
    const folderId = folder.id;

    const blindIndexCfg = await secretBlindIndexDAL.findOne({ projectId });
    if (!blindIndexCfg) throw new BadRequestError({ message: "Blind index not found", name: "Update secret" });

    const { keyName2BlindIndex } = await fnSecretBlindIndexCheck({
      inputSecrets,
      folderId,
      isNew: false,
      blindIndexCfg,
      secretDAL
    });

    // now find any secret that needs to update its name
    // same process as above
    const nameUpdatedSecrets = inputSecrets.filter(({ newSecretName }) => Boolean(newSecretName));
    const { keyName2BlindIndex: newKeyName2BlindIndex } = await fnSecretBlindIndexCheck({
      inputSecrets: nameUpdatedSecrets,
      folderId,
      isNew: true,
      blindIndexCfg,
      secretDAL
    });

    // get all tags
    const tagIds = inputSecrets.flatMap(({ tags = [] }) => tags);
    const tags = tagIds.length ? await secretTagDAL.findManyTagsById(projectId, tagIds) : [];
    if (tagIds.length !== tags.length) throw new BadRequestError({ message: "Tag not found" });

    const references = await getSecretReference(projectId);
    const secrets = await secretDAL.transaction(async (tx) =>
      fnSecretBulkUpdate({
        folderId,
        projectId,
        tx,
        inputSecrets: inputSecrets.map(({ secretName, newSecretName, ...el }) => ({
          filter: { secretBlindIndex: keyName2BlindIndex[secretName], type: SecretType.Shared },
          data: {
            ...el,
            folderId,
            type: SecretType.Shared,
            secretBlindIndex:
              newSecretName && newKeyName2BlindIndex[newSecretName]
                ? newKeyName2BlindIndex[newSecretName]
                : keyName2BlindIndex[secretName],
            algorithm: SecretEncryptionAlgo.AES_256_GCM,
            keyEncoding: SecretKeyEncoding.UTF8,
            references:
              el.secretValueIV && el.secretValueTag
                ? references({
                    ciphertext: el.secretValueCiphertext,
                    iv: el.secretValueIV,
                    tag: el.secretValueTag
                  })
                : undefined
          }
        })),
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
      secretPath: path,
      projectId,
      environmentSlug: folder.environment.slug
    });

    return secrets;
  };

  const deleteManySecret = async ({
    secrets: inputSecrets,
    path,
    environment,
    projectId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TDeleteBulkSecretDTO) => {
    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Delete,
      subject(ProjectPermissionSub.Secrets, { environment, secretPath: path })
    );

    await projectDAL.checkProjectUpgradeStatus(projectId);

    const folder = await folderDAL.findBySecretPath(projectId, environment, path);
    if (!folder)
      throw new BadRequestError({
        message: "Folder not found for the given environment slug & secret path",
        name: "Create secret"
      });
    const folderId = folder.id;

    const blindIndexCfg = await secretBlindIndexDAL.findOne({ projectId });
    if (!blindIndexCfg) throw new BadRequestError({ message: "Blind index not found", name: "Update secret" });

    const { keyName2BlindIndex } = await fnSecretBlindIndexCheck({
      inputSecrets,
      folderId,
      isNew: false,
      blindIndexCfg,
      secretDAL
    });

    const secretsDeleted = await secretDAL.transaction(async (tx) =>
      fnSecretBulkDelete({
        secretDAL,
        secretQueueService,
        inputSecrets: inputSecrets.map(({ type, secretName }) => ({
          secretBlindIndex: keyName2BlindIndex[secretName],
          type
        })),
        projectId,
        folderId,
        actorId,
        tx
      })
    );

    await snapshotService.performSnapshot(folderId);
    await secretQueueService.syncSecrets({
      actor,
      actorId,
      secretPath: path,
      projectId,
      environmentSlug: folder.environment.slug
    });

    return secretsDeleted;
  };

  const getSecretsCount = async ({
    projectId,
    path,
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    environment,
    tagSlugs = [],
    ...v2Params
  }: Pick<
    TGetSecretsRawDTO,
    | "projectId"
    | "path"
    | "actor"
    | "actorId"
    | "actorOrgId"
    | "actorAuthMethod"
    | "environment"
    | "tagSlugs"
    | "search"
  >) => {
    const { shouldUseSecretV2Bridge } = await projectBotService.getBotKey(projectId);

    if (!shouldUseSecretV2Bridge)
      throw new BadRequestError({
        message: "Project version does not support pagination",
        name: "pagination_not_supported"
      });

    const count = await secretV2BridgeService.getSecretsCount({
      projectId,
      actorId,
      actor,
      actorOrgId,
      environment,
      path,
      actorAuthMethod,
      tagSlugs,
      ...v2Params
    });

    return count;
  };

  const getSecretsCountMultiEnv = async ({
    projectId,
    path,
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    environments,
    ...v2Params
  }: Pick<
    TGetSecretsRawDTO,
    "projectId" | "path" | "actor" | "actorId" | "actorOrgId" | "actorAuthMethod" | "search"
  > & { environments: string[]; isInternal?: boolean }) => {
    const { shouldUseSecretV2Bridge } = await projectBotService.getBotKey(projectId);

    if (!shouldUseSecretV2Bridge)
      throw new BadRequestError({
        message: "Project version does not support pagination",
        name: "pagination_not_supported"
      });

    const count = await secretV2BridgeService.getSecretsCountMultiEnv({
      projectId,
      actorId,
      actor,
      actorOrgId,
      environments,
      path,
      actorAuthMethod,
      ...v2Params
    });

    return count;
  };

  const getSecretsRawMultiEnv = async ({
    projectId,
    path,
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    environments,
    ...params
  }: Omit<TGetSecretsRawDTO, "environment" | "includeImports" | "expandSecretReferences" | "recursive" | "tagSlugs"> & {
    environments: string[];
    isInternal?: boolean;
  }) => {
    const { shouldUseSecretV2Bridge } = await projectBotService.getBotKey(projectId);

    if (!shouldUseSecretV2Bridge)
      throw new BadRequestError({
        message: "Project version does not support pagination",
        name: "pagination_not_supported"
      });

    const secrets = await secretV2BridgeService.getSecretsMultiEnv({
      projectId,
      actorId,
      actor,
      actorOrgId,
      environments,
      path,
      actorAuthMethod,
      ...params
    });

    return secrets;
  };

  const getSecretsRaw = async ({
    projectId,
    path,
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    environment,
    includeImports,
    expandSecretReferences,
    recursive,
    tagSlugs = [],
    ...paramsV2
  }: TGetSecretsRawDTO) => {
    const { botKey, shouldUseSecretV2Bridge } = await projectBotService.getBotKey(projectId);
    if (shouldUseSecretV2Bridge) {
      const { secrets, imports } = await secretV2BridgeService.getSecrets({
        projectId,
        expandSecretReferences,
        actorId,
        actor,
        actorOrgId,
        environment,
        path,
        recursive,
        actorAuthMethod,
        includeImports,
        tagSlugs,
        ...paramsV2
      });
      return { secrets, imports };
    }

    if (!botKey)
      throw new BadRequestError({
        message: "Project bot not found. Please upgrade your project.",
        name: "bot_not_found_error"
      });

    const { secrets, imports } = await getSecrets({
      actorId,
      projectId,
      environment,
      actor,
      actorOrgId,
      actorAuthMethod,
      path,
      includeImports,
      recursive
    });

    const decryptedSecrets = secrets.map((el) => decryptSecretRaw(el, botKey));
    const filteredSecrets = tagSlugs.length
      ? decryptedSecrets.filter((secret) => Boolean(secret.tags?.find((el) => tagSlugs.includes(el.slug))))
      : decryptedSecrets;
    const processedImports = (imports || [])?.map(({ secrets: importedSecrets, ...el }) => {
      const decryptedImportSecrets = importedSecrets.map((sec) =>
        decryptSecretRaw(
          { ...sec, environment: el.environment, workspace: projectId, secretPath: el.secretPath },
          botKey
        )
      );

      // secret-override to handle duplicate keys from different import levels
      // this prioritizes secret values from direct imports
      const importedKeys = new Set<string>();
      const importedEntries = decryptedImportSecrets.reduce(
        (
          accum: {
            secretKey: string;
            secretPath: string;
            workspace: string;
            environment: string;
            secretValue: string;
            secretComment: string;
            version: number;
            type: string;
            _id: string;
            id: string;
            user: string | null | undefined;
            skipMultilineEncoding: boolean | null | undefined;
          }[],
          sec
        ) => {
          if (!importedKeys.has(sec.secretKey)) {
            importedKeys.add(sec.secretKey);
            return [...accum, sec];
          }
          return accum;
        },
        []
      );

      return {
        ...el,
        secrets: importedEntries
      };
    });

    const expandSecret = interpolateSecrets({
      folderDAL,
      projectId,
      secretDAL,
      secretEncKey: botKey
    });

    if (expandSecretReferences) {
      const secretsGroupByPath = groupBy(filteredSecrets, (i) => i.secretPath);
      await Promise.allSettled(
        Object.keys(secretsGroupByPath).map((groupedPath) =>
          Promise.allSettled(
            secretsGroupByPath[groupedPath].map(async (decryptedSecret, index) => {
              const expandedSecretValue = await expandSecret({
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
      await Promise.allSettled(
        processedImports.map((processedImport) =>
          Promise.allSettled(
            processedImport.secrets.map(async (decryptedSecret, index) => {
              const expandedSecretValue = await expandSecret({
                value: decryptedSecret.secretValue,
                secretPath: path,
                environment,
                skipMultilineEncoding: decryptedSecret.skipMultilineEncoding
              });
              // eslint-disable-next-line no-param-reassign
              processedImport.secrets[index].secretValue = expandedSecretValue || "";
            })
          )
        )
      );
    }

    return {
      secrets: filteredSecrets,
      imports: processedImports
    };
  };

  const getSecretByNameRaw = async ({
    type,
    path,
    actor,
    environment,
    projectId: workspaceId,
    expandSecretReferences,
    projectSlug,
    actorId,
    actorOrgId,
    actorAuthMethod,
    secretName,
    includeImports,
    version
  }: TGetASecretRawDTO) => {
    const projectId = workspaceId || (await projectDAL.findProjectBySlug(projectSlug as string, actorOrgId)).id;
    const { botKey, shouldUseSecretV2Bridge } = await projectBotService.getBotKey(projectId);
    if (shouldUseSecretV2Bridge) {
      const secret = await secretV2BridgeService.getSecretByName({
        environment,
        projectId,
        includeImports,
        actorAuthMethod,
        path,
        actorOrgId,
        actor,
        actorId,
        expandSecretReferences,
        type,
        secretName
      });

      return secret;
    }

    const encryptedSecret = await getSecretByName({
      actorId,
      projectId,
      actorAuthMethod,
      environment,
      actor,
      actorOrgId,
      path,
      secretName,
      type,
      includeImports,
      version
    });

    if (!botKey)
      throw new BadRequestError({
        message: "Project bot not found. Please upgrade your project.",
        name: "bot_not_found_error"
      });
    const decryptedSecret = decryptSecretRaw(encryptedSecret, botKey);

    if (expandSecretReferences) {
      const expandSecret = interpolateSecrets({
        folderDAL,
        projectId,
        secretDAL,
        secretEncKey: botKey
      });
      const expandedSecretValue = await expandSecret({
        environment,
        secretPath: path,
        value: decryptedSecret.secretValue,
        skipMultilineEncoding: decryptedSecret.skipMultilineEncoding
      });
      decryptedSecret.secretValue = expandedSecretValue || "";
    }

    return decryptedSecret;
  };

  const createSecretRaw = async ({
    secretName,
    actorId,
    projectId,
    environment,
    actor,
    actorOrgId,
    actorAuthMethod,
    type,
    secretPath,
    secretValue,
    secretComment,
    skipMultilineEncoding,
    tagIds,
    secretReminderNote,
    secretReminderRepeatDays
  }: TCreateSecretRawDTO) => {
    const { botKey, shouldUseSecretV2Bridge } = await projectBotService.getBotKey(projectId);
    const policy =
      actor === ActorType.USER && type === SecretType.Shared
        ? await secretApprovalPolicyService.getSecretApprovalPolicy(projectId, environment, secretPath)
        : undefined;
    if (shouldUseSecretV2Bridge) {
      if (policy) {
        const approval = await secretApprovalRequestService.generateSecretApprovalRequestV2Bridge({
          policy,
          secretPath,
          environment,
          projectId,
          actor,
          actorId,
          actorOrgId,
          actorAuthMethod,
          data: {
            [SecretOperations.Create]: [
              {
                secretKey: secretName,
                skipMultilineEncoding,
                secretComment,
                secretValue,
                tagIds,
                reminderNote: secretReminderNote,
                reminderRepeatDays: secretReminderRepeatDays
              }
            ]
          }
        });
        return { type: SecretProtectionType.Approval as const, approval };
      }

      const secret = await secretV2BridgeService.createSecret({
        secretName,
        type,
        actorId,
        actor,
        actorOrgId,
        actorAuthMethod,
        projectId,
        environment,
        secretPath,
        secretComment,
        secretValue,
        tagIds,
        secretReminderNote,
        skipMultilineEncoding,
        secretReminderRepeatDays
      });
      return { secret, type: SecretProtectionType.Direct as const };
    }

    if (!botKey)
      throw new BadRequestError({
        message: "Project bot not found. Please upgrade your project.",
        name: "bot_not_found_error"
      });
    const secretKeyEncrypted = encryptSymmetric128BitHexKeyUTF8(secretName, botKey);
    const secretValueEncrypted = encryptSymmetric128BitHexKeyUTF8(secretValue || "", botKey);
    const secretCommentEncrypted = encryptSymmetric128BitHexKeyUTF8(secretComment || "", botKey);
    if (policy) {
      const approval = await secretApprovalRequestService.generateSecretApprovalRequest({
        policy,
        secretPath,
        environment,
        projectId,
        actor,
        actorId,
        actorOrgId,
        actorAuthMethod,
        data: {
          [SecretOperations.Create]: [
            {
              secretName,
              secretKeyCiphertext: secretKeyEncrypted.ciphertext,
              secretKeyIV: secretKeyEncrypted.iv,
              secretKeyTag: secretKeyEncrypted.tag,
              secretValueCiphertext: secretValueEncrypted.ciphertext,
              secretValueIV: secretValueEncrypted.iv,
              secretValueTag: secretValueEncrypted.tag,
              secretCommentCiphertext: secretCommentEncrypted.ciphertext,
              secretCommentIV: secretCommentEncrypted.iv,
              secretCommentTag: secretCommentEncrypted.tag,
              skipMultilineEncoding,
              tagIds
            }
          ]
        }
      });
      return { type: SecretProtectionType.Approval as const, approval };
    }

    const secret = await createSecret({
      secretName,
      projectId,
      environment,
      type,
      path: secretPath,
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId,
      secretKeyCiphertext: secretKeyEncrypted.ciphertext,
      secretKeyIV: secretKeyEncrypted.iv,
      secretKeyTag: secretKeyEncrypted.tag,
      secretValueCiphertext: secretValueEncrypted.ciphertext,
      secretValueIV: secretValueEncrypted.iv,
      secretValueTag: secretValueEncrypted.tag,
      secretCommentCiphertext: secretCommentEncrypted.ciphertext,
      secretCommentIV: secretCommentEncrypted.iv,
      secretCommentTag: secretCommentEncrypted.tag,
      skipMultilineEncoding,
      secretReminderRepeatDays,
      secretReminderNote,
      tags: tagIds
    });

    return { type: SecretProtectionType.Direct as const, secret: decryptSecretRaw(secret, botKey) };
  };

  const updateSecretRaw = async ({
    secretName,
    actorId,
    projectId,
    environment,
    actor,
    actorOrgId,
    actorAuthMethod,
    type,
    secretPath,
    secretValue,
    skipMultilineEncoding,
    tagIds,
    secretReminderNote,
    secretReminderRepeatDays,
    metadata,
    secretComment,
    newSecretName
  }: TUpdateSecretRawDTO) => {
    const { botKey, shouldUseSecretV2Bridge } = await projectBotService.getBotKey(projectId);
    const policy =
      actor === ActorType.USER && type === SecretType.Shared
        ? await secretApprovalPolicyService.getSecretApprovalPolicy(projectId, environment, secretPath)
        : undefined;
    if (shouldUseSecretV2Bridge) {
      if (policy) {
        const approval = await secretApprovalRequestService.generateSecretApprovalRequestV2Bridge({
          policy,
          secretPath,
          environment,
          projectId,
          actor,
          actorId,
          actorOrgId,
          actorAuthMethod,
          data: {
            [SecretOperations.Update]: [
              {
                secretKey: secretName,
                newSecretName,
                skipMultilineEncoding,
                secretComment,
                secretValue,
                tagIds,
                reminderNote: secretReminderNote,
                reminderRepeatDays: secretReminderRepeatDays
              }
            ]
          }
        });
        return { type: SecretProtectionType.Approval as const, approval };
      }
      const secret = await secretV2BridgeService.updateSecret({
        secretReminderRepeatDays,
        skipMultilineEncoding,
        secretReminderNote,
        tagIds,
        secretComment,
        secretPath,
        environment,
        projectId,
        actorAuthMethod,
        actorOrgId,
        actor,
        actorId,
        type,
        secretName,
        newSecretName,
        metadata,
        secretValue
      });
      return { type: SecretProtectionType.Direct as const, secret };
    }

    if (!botKey)
      throw new BadRequestError({
        message: "Project bot not found. Please upgrade your project.",
        name: "bot_not_found_error"
      });

    const secretValueEncrypted = encryptSymmetric128BitHexKeyUTF8(secretValue || "", botKey);
    const secretCommentEncrypted = encryptSymmetric128BitHexKeyUTF8(secretComment || "", botKey);
    const secretKeyEncrypted = encryptSymmetric128BitHexKeyUTF8(newSecretName || secretName, botKey);

    if (policy) {
      const approval = await secretApprovalRequestService.generateSecretApprovalRequest({
        policy,
        secretPath,
        environment,
        projectId,
        actor,
        actorId,
        actorOrgId,
        actorAuthMethod,
        data: {
          [SecretOperations.Update]: [
            {
              secretName,
              newSecretName,
              skipMultilineEncoding,
              secretKeyCiphertext: secretKeyEncrypted.ciphertext,
              secretKeyIV: secretKeyEncrypted.iv,
              secretKeyTag: secretKeyEncrypted.tag,
              secretValueCiphertext: secretValueEncrypted.ciphertext,
              secretValueIV: secretValueEncrypted.iv,
              secretValueTag: secretValueEncrypted.tag,
              secretCommentCiphertext: secretCommentEncrypted.ciphertext,
              secretCommentIV: secretCommentEncrypted.iv,
              secretCommentTag: secretCommentEncrypted.tag,
              tagIds,
              secretReminderNote,
              secretReminderRepeatDays
            }
          ]
        }
      });
      return { approval, type: SecretProtectionType.Approval as const };
    }

    const secret = await updateSecret({
      secretName,
      projectId,
      environment,
      type,
      path: secretPath,
      actor,
      actorId,
      actorOrgId,
      actorAuthMethod,
      secretValueCiphertext: secretValueEncrypted.ciphertext,
      secretValueIV: secretValueEncrypted.iv,
      secretValueTag: secretValueEncrypted.tag,
      skipMultilineEncoding,
      tags: tagIds,
      metadata,
      secretReminderRepeatDays,
      secretReminderNote,
      newSecretName,
      secretKeyIV: secretKeyEncrypted.iv,
      secretKeyTag: secretKeyEncrypted.tag,
      secretKeyCiphertext: secretKeyEncrypted.ciphertext,
      secretCommentIV: secretCommentEncrypted.iv,
      secretCommentTag: secretCommentEncrypted.tag,
      secretCommentCiphertext: secretCommentEncrypted.ciphertext
    });

    await snapshotService.performSnapshot(secret.folderId);
    return { type: SecretProtectionType.Direct as const, secret: decryptSecretRaw(secret, botKey) };
  };

  const deleteSecretRaw = async ({
    secretName,
    actorId,
    projectId,
    environment,
    actor,
    actorOrgId,
    actorAuthMethod,
    type,
    secretPath
  }: TDeleteSecretRawDTO) => {
    const { botKey, shouldUseSecretV2Bridge } = await projectBotService.getBotKey(projectId);
    const policy =
      actor === ActorType.USER && type === SecretType.Shared
        ? await secretApprovalPolicyService.getSecretApprovalPolicy(projectId, environment, secretPath)
        : undefined;
    if (shouldUseSecretV2Bridge) {
      if (policy) {
        const approval = await secretApprovalRequestService.generateSecretApprovalRequestV2Bridge({
          policy,
          actorAuthMethod,
          actorOrgId,
          actorId,
          actor,
          projectId,
          environment,
          secretPath,
          data: {
            [SecretOperations.Delete]: [
              {
                secretKey: secretName
              }
            ]
          }
        });
        return { type: SecretProtectionType.Approval as const, approval };
      }
      const secret = await secretV2BridgeService.deleteSecret({
        secretName,
        type,
        actorId,
        actor,
        actorOrgId,
        actorAuthMethod,
        projectId,
        environment,
        secretPath
      });
      return { type: SecretProtectionType.Direct as const, secret };
    }
    if (!botKey)
      throw new BadRequestError({
        message: "Project bot not found. Please upgrade your project.",
        name: "bot_not_found_error"
      });
    if (policy) {
      const approval = await secretApprovalRequestService.generateSecretApprovalRequest({
        policy,
        actorAuthMethod,
        actorOrgId,
        actorId,
        actor,
        projectId,
        environment,
        secretPath,
        data: {
          [SecretOperations.Delete]: [
            {
              secretName
            }
          ]
        }
      });
      return { type: SecretProtectionType.Approval as const, approval };
    }
    const secret = await deleteSecret({
      secretName,
      projectId,
      environment,
      type,
      path: secretPath,
      actor,
      actorId,
      actorOrgId,
      actorAuthMethod
    });

    return { type: SecretProtectionType.Direct as const, secret: decryptSecretRaw(secret, botKey) };
  };

  const createManySecretsRaw = async ({
    actorId,
    projectSlug,
    projectId: optionalProjectId,
    environment,
    actor,
    actorOrgId,
    actorAuthMethod,
    secretPath,
    secrets: inputSecrets = []
  }: TCreateManySecretRawDTO) => {
    if (!projectSlug && !optionalProjectId)
      throw new BadRequestError({ message: "Must provide either project slug or projectId" });

    let projectId = optionalProjectId as string;
    // pick either project slug or projectid
    if (!optionalProjectId && projectSlug) {
      const project = await projectDAL.findProjectBySlug(projectSlug, actorOrgId);
      if (!project) throw new BadRequestError({ message: "Project not found" });
      projectId = project.id;
    }

    const { botKey, shouldUseSecretV2Bridge } = await projectBotService.getBotKey(projectId);
    const policy =
      actor === ActorType.USER
        ? await secretApprovalPolicyService.getSecretApprovalPolicy(projectId, environment, secretPath)
        : undefined;
    if (shouldUseSecretV2Bridge) {
      if (policy) {
        const approval = await secretApprovalRequestService.generateSecretApprovalRequestV2Bridge({
          policy,
          secretPath,
          environment,
          projectId,
          actor,
          actorId,
          actorOrgId,
          actorAuthMethod,
          data: {
            [SecretOperations.Create]: inputSecrets.map((el) => ({
              tagIds: el.tagIds,
              secretValue: el.secretValue,
              secretComment: el.secretComment,
              metadata: el.metadata,
              skipMultilineEncoding: el.skipMultilineEncoding,
              secretKey: el.secretKey
            }))
          }
        });
        return { type: SecretProtectionType.Approval as const, approval };
      }
      const secrets = await secretV2BridgeService.createManySecret({
        secretPath,
        environment,
        projectId,
        actorAuthMethod,
        actorOrgId,
        actor,
        actorId,
        secrets: inputSecrets
      });
      return { secrets, type: SecretProtectionType.Direct as const };
    }

    if (!botKey)
      throw new BadRequestError({
        message: "Project bot not found. Please upgrade your project.",
        name: "bot_not_found_error"
      });
    const sanitizedSecrets = inputSecrets.map(
      ({ secretComment, secretKey, metadata, tagIds, secretValue, skipMultilineEncoding }) => {
        const secretKeyEncrypted = encryptSymmetric128BitHexKeyUTF8(secretKey, botKey);
        const secretValueEncrypted = encryptSymmetric128BitHexKeyUTF8(secretValue || "", botKey);
        const secretCommentEncrypted = encryptSymmetric128BitHexKeyUTF8(secretComment || "", botKey);
        return {
          secretName: secretKey,
          skipMultilineEncoding,
          secretKeyCiphertext: secretKeyEncrypted.ciphertext,
          secretKeyIV: secretKeyEncrypted.iv,
          secretKeyTag: secretKeyEncrypted.tag,
          secretValueCiphertext: secretValueEncrypted.ciphertext,
          secretValueIV: secretValueEncrypted.iv,
          secretValueTag: secretValueEncrypted.tag,
          secretCommentCiphertext: secretCommentEncrypted.ciphertext,
          secretCommentIV: secretCommentEncrypted.iv,
          secretCommentTag: secretCommentEncrypted.tag,
          tags: tagIds,
          tagIds,
          metadata
        };
      }
    );
    if (policy) {
      const approval = await secretApprovalRequestService.generateSecretApprovalRequest({
        policy,
        secretPath,
        environment,
        projectId,
        actor,
        actorId,
        actorOrgId,
        actorAuthMethod,
        data: {
          [SecretOperations.Create]: sanitizedSecrets
        }
      });
      return { type: SecretProtectionType.Approval as const, approval };
    }

    const secrets = await createManySecret({
      projectId,
      environment,
      path: secretPath,
      actor,
      actorId,
      actorOrgId,
      actorAuthMethod,
      secrets: sanitizedSecrets
    });

    return {
      type: SecretProtectionType.Direct as const,
      secrets: secrets.map((secret) =>
        decryptSecretRaw({ ...secret, workspace: projectId, environment, secretPath }, botKey)
      )
    };
  };

  const updateManySecretsRaw = async ({
    actorId,
    projectSlug,
    projectId: optionalProjectId,
    environment,
    actor,
    actorOrgId,
    actorAuthMethod,
    secretPath,
    secrets: inputSecrets = []
  }: TUpdateManySecretRawDTO) => {
    if (!projectSlug && !optionalProjectId)
      throw new BadRequestError({ message: "Must provide either project slug or projectId" });

    let projectId = optionalProjectId as string;
    if (!optionalProjectId && projectSlug) {
      const project = await projectDAL.findProjectBySlug(projectSlug, actorOrgId);
      if (!project) throw new BadRequestError({ message: "Project not found" });
      projectId = project.id;
    }

    const { botKey, shouldUseSecretV2Bridge } = await projectBotService.getBotKey(projectId);
    const policy =
      actor === ActorType.USER
        ? await secretApprovalPolicyService.getSecretApprovalPolicy(projectId, environment, secretPath)
        : undefined;
    if (shouldUseSecretV2Bridge) {
      if (policy) {
        const approval = await secretApprovalRequestService.generateSecretApprovalRequestV2Bridge({
          policy,
          secretPath,
          environment,
          projectId,
          actor,
          actorId,
          actorOrgId,
          actorAuthMethod,
          data: {
            [SecretOperations.Update]: inputSecrets.map((el) => ({
              tagIds: el.tagIds,
              secretValue: el.secretValue,
              secretComment: el.secretComment,
              skipMultilineEncoding: el.skipMultilineEncoding,
              secretKey: el.secretKey
            }))
          }
        });
        return { type: SecretProtectionType.Approval as const, approval };
      }
      const secrets = await secretV2BridgeService.updateManySecret({
        secretPath,
        environment,
        projectId,
        actorAuthMethod,
        actorOrgId,
        actor,
        actorId,
        secrets: inputSecrets
      });
      return { type: SecretProtectionType.Direct as const, secrets };
    }

    if (!botKey)
      throw new BadRequestError({
        message: "Project bot not found. Please upgrade your project.",
        name: "bot_not_found_error"
      });
    const sanitizedSecrets = inputSecrets.map(
      ({
        secretComment,
        secretKey,
        secretValue,
        skipMultilineEncoding,
        tagIds: tags,
        newSecretName,
        secretReminderNote,
        secretReminderRepeatDays
      }) => {
        const secretKeyEncrypted = encryptSymmetric128BitHexKeyUTF8(newSecretName || secretKey, botKey);
        const secretValueEncrypted = encryptSymmetric128BitHexKeyUTF8(secretValue || "", botKey);
        const secretCommentEncrypted = encryptSymmetric128BitHexKeyUTF8(secretComment || "", botKey);
        return {
          secretName: secretKey,
          newSecretName,
          tags,
          tagIds: tags,
          secretReminderRepeatDays,
          secretReminderNote,
          type: SecretType.Shared,
          skipMultilineEncoding,
          secretKeyCiphertext: secretKeyEncrypted.ciphertext,
          secretKeyIV: secretKeyEncrypted.iv,
          secretKeyTag: secretKeyEncrypted.tag,
          secretValueCiphertext: secretValueEncrypted.ciphertext,
          secretValueIV: secretValueEncrypted.iv,
          secretValueTag: secretValueEncrypted.tag,
          secretCommentCiphertext: secretCommentEncrypted.ciphertext,
          secretCommentIV: secretCommentEncrypted.iv,
          secretCommentTag: secretCommentEncrypted.tag
        };
      }
    );
    if (policy) {
      const approval = await secretApprovalRequestService.generateSecretApprovalRequest({
        policy,
        secretPath,
        environment,
        projectId,
        actor,
        actorId,
        actorOrgId,
        actorAuthMethod,
        data: {
          [SecretOperations.Update]: sanitizedSecrets
        }
      });

      return { type: SecretProtectionType.Approval as const, approval };
    }
    const secrets = await updateManySecret({
      projectId,
      environment,
      path: secretPath,
      actor,
      actorId,
      actorOrgId,
      actorAuthMethod,
      secrets: sanitizedSecrets
    });

    return {
      type: SecretProtectionType.Direct as const,
      secrets: secrets.map((secret) =>
        decryptSecretRaw({ ...secret, workspace: projectId, environment, secretPath }, botKey)
      )
    };
  };

  const deleteManySecretsRaw = async ({
    actorId,
    projectSlug,
    projectId: optionalProjectId,
    environment,
    actor,
    actorOrgId,
    actorAuthMethod,
    secretPath,
    secrets: inputSecrets = []
  }: TDeleteManySecretRawDTO) => {
    if (!projectSlug && !optionalProjectId)
      throw new BadRequestError({ message: "Must provide either project slug or projectId" });

    let projectId = optionalProjectId as string;
    if (!optionalProjectId && projectSlug) {
      const project = await projectDAL.findProjectBySlug(projectSlug, actorOrgId);
      if (!project) throw new BadRequestError({ message: "Project not found" });
      projectId = project.id;
    }

    const { botKey, shouldUseSecretV2Bridge } = await projectBotService.getBotKey(projectId);
    const policy =
      actor === ActorType.USER
        ? await secretApprovalPolicyService.getSecretApprovalPolicy(projectId, environment, secretPath)
        : undefined;
    if (shouldUseSecretV2Bridge) {
      if (policy) {
        const approval = await secretApprovalRequestService.generateSecretApprovalRequestV2Bridge({
          policy,
          actorAuthMethod,
          actorOrgId,
          actorId,
          actor,
          projectId,
          environment,
          secretPath,
          data: {
            [SecretOperations.Delete]: inputSecrets
          }
        });
        return { type: SecretProtectionType.Approval as const, approval };
      }
      const secrets = await secretV2BridgeService.deleteManySecret({
        secretPath,
        environment,
        projectId,
        actorAuthMethod,
        actorOrgId,
        actor,
        actorId,
        secrets: inputSecrets
      });
      return { type: SecretProtectionType.Direct as const, secrets };
    }

    if (!botKey)
      throw new BadRequestError({
        message: "Project bot not found. Please upgrade your project.",
        name: "bot_not_found_error"
      });

    if (policy) {
      const approval = await secretApprovalRequestService.generateSecretApprovalRequest({
        policy,
        actorAuthMethod,
        actorOrgId,
        actorId,
        actor,
        projectId,
        environment,
        secretPath,
        data: {
          [SecretOperations.Delete]: inputSecrets.map((el) => ({ secretName: el.secretKey }))
        }
      });
      return { type: SecretProtectionType.Approval as const, approval };
    }
    const secrets = await deleteManySecret({
      projectId,
      environment,
      path: secretPath,
      actor,
      actorId,
      actorOrgId,
      actorAuthMethod,
      secrets: inputSecrets.map(({ secretKey, type = SecretType.Shared }) => ({ secretName: secretKey, type }))
    });

    return {
      type: SecretProtectionType.Direct as const,
      secrets: secrets.map((secret) =>
        decryptSecretRaw({ ...secret, workspace: projectId, environment, secretPath }, botKey)
      )
    };
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
    const secretVersionV2 = await secretV2BridgeService
      .getSecretVersions({
        actorId,
        actor,
        actorOrgId,
        actorAuthMethod,
        limit,
        offset,
        secretId
      })
      .catch((err) => {
        if ((err as Error).message === "BadRequest: Failed to find secret") {
          return null;
        }
      });
    if (secretVersionV2) return secretVersionV2;

    const secret = await secretDAL.findById(secretId);
    if (!secret) throw new BadRequestError({ message: "Failed to find secret" });
    const folder = await folderDAL.findById(secret.folderId);
    if (!folder) throw new BadRequestError({ message: "Failed to find secret" });

    const { botKey } = await projectBotService.getBotKey(folder.projectId);
    if (!botKey) throw new BadRequestError({ message: "bot not found" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      folder.projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.SecretRollback);
    const secretVersions = await secretVersionDAL.find({ secretId }, { offset, limit, sort: [["createdAt", "desc"]] });
    return secretVersions.map((el) =>
      decryptSecretRaw(
        {
          ...el,
          workspace: folder.projectId,
          environment: folder.environment.envSlug,
          secretPath: "/"
        },
        botKey
      )
    );
  };

  const attachTags = async ({
    secretName,
    tagSlugs,
    path: secretPath,
    environment,
    type,
    projectSlug,
    actor,
    actorAuthMethod,
    actorOrgId,
    actorId
  }: TAttachSecretTagsDTO) => {
    const project = await projectDAL.findProjectBySlug(projectSlug, actorOrgId);
    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      project.id,
      actorAuthMethod,
      actorOrgId
    );

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Edit,
      subject(ProjectPermissionSub.Secrets, { environment, secretPath })
    );

    await projectDAL.checkProjectUpgradeStatus(project.id);

    const secret = await getSecretByName({
      actorId,
      actor,
      actorOrgId,
      actorAuthMethod,
      projectId: project.id,
      environment,
      path: secretPath,
      secretName,
      type
    });

    if (!secret) {
      throw new BadRequestError({ message: "Secret not found" });
    }
    const folder = await folderDAL.findBySecretPath(project.id, environment, secretPath);

    if (!folder) {
      throw new BadRequestError({ message: "Folder not found" });
    }

    const tags = await secretTagDAL.find({
      projectId: project.id,
      $in: {
        slug: tagSlugs
      }
    });

    if (tags.length !== tagSlugs.length) {
      throw new BadRequestError({ message: "One or more tags not found." });
    }

    const existingSecretTags = await secretDAL.getSecretTags(secret.id);

    if (existingSecretTags.some((tag) => tagSlugs.includes(tag.slug))) {
      throw new BadRequestError({ message: "One or more tags already exist on the secret" });
    }

    const combinedTags = new Set([...existingSecretTags.map((tag) => tag.id), ...tags.map((el) => el.id)]);

    const updatedSecret = await secretDAL.transaction(async (tx) =>
      fnSecretBulkUpdate({
        folderId: folder.id,
        projectId: project.id,
        inputSecrets: [
          {
            filter: { id: secret.id },
            data: {
              tags: Array.from(combinedTags)
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

    await snapshotService.performSnapshot(folder.id);
    await secretQueueService.syncSecrets({
      secretPath,
      projectId: project.id,
      environmentSlug: environment,
      excludeReplication: true
    });

    return {
      ...updatedSecret[0],
      tags: [...existingSecretTags, ...tags].map((t) => ({ id: t.id, slug: t.slug, name: t.slug, color: t.color }))
    };
  };

  const detachTags = async ({
    secretName,
    tagSlugs,
    path: secretPath,
    environment,
    type,
    projectSlug,
    actor,
    actorAuthMethod,
    actorOrgId,
    actorId
  }: TAttachSecretTagsDTO) => {
    const project = await projectDAL.findProjectBySlug(projectSlug, actorOrgId);
    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      project.id,
      actorAuthMethod,
      actorOrgId
    );

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Edit,
      subject(ProjectPermissionSub.Secrets, { environment, secretPath })
    );

    await projectDAL.checkProjectUpgradeStatus(project.id);

    const secret = await getSecretByName({
      actorId,
      actor,
      actorOrgId,
      actorAuthMethod,
      projectId: project.id,
      environment,
      path: secretPath,
      secretName,
      type
    });

    if (!secret) {
      throw new BadRequestError({ message: "Secret not found" });
    }
    const folder = await folderDAL.findBySecretPath(project.id, environment, secretPath);

    if (!folder) {
      throw new BadRequestError({ message: "Folder not found" });
    }

    const tags = await secretTagDAL.find({
      projectId: project.id,
      $in: {
        slug: tagSlugs
      }
    });

    if (tags.length !== tagSlugs.length) {
      throw new BadRequestError({ message: "One or more tags not found." });
    }

    const existingSecretTags = await secretDAL.getSecretTags(secret.id);

    // Make sure all the tags exist on the secret
    const tagIdsToRemove = tags.map((tag) => tag.id);
    const secretTagIds = existingSecretTags.map((tag) => tag.id);

    if (!tagIdsToRemove.every((el) => secretTagIds.includes(el))) {
      throw new BadRequestError({ message: "One or more tags not found on the secret" });
    }

    const newTags = existingSecretTags.filter((tag) => !tagIdsToRemove.includes(tag.id));

    const updatedSecret = await secretDAL.transaction(async (tx) =>
      fnSecretBulkUpdate({
        folderId: folder.id,
        projectId: project.id,
        inputSecrets: [
          {
            filter: { id: secret.id },
            data: {
              tags: newTags.map((tag) => tag.id)
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

    await snapshotService.performSnapshot(folder.id);
    await secretQueueService.syncSecrets({
      secretPath,
      projectId: project.id,
      environmentSlug: environment,
      excludeReplication: true
    });

    return {
      ...updatedSecret[0],
      tags: newTags
    };
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

    const { botKey, shouldUseSecretV2Bridge } = await projectBotService.getBotKey(projectId);
    if (shouldUseSecretV2Bridge) {
      return secretV2BridgeService.backfillSecretReferences({
        projectId,
        actor,
        actorId,
        actorOrgId,
        actorAuthMethod
      });
    }

    if (!botKey)
      throw new BadRequestError({
        message: "Project bot not found. Please upgrade your project.",
        name: "bot_not_found_error"
      });

    await secretDAL.transaction(async (tx) => {
      const secrets = await secretDAL.findAllProjectSecretValues(projectId, tx);
      await secretDAL.upsertSecretReferences(
        secrets.map(({ id, secretValueCiphertext, secretValueIV, secretValueTag }) => ({
          secretId: id,
          references: getAllNestedSecretReferences(
            decryptSymmetric128BitHexKeyUTF8({
              ciphertext: secretValueCiphertext,
              iv: secretValueIV,
              tag: secretValueTag,
              key: botKey
            })
          )
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
    projectSlug,
    shouldOverwrite,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TMoveSecretsDTO) => {
    const project = await projectDAL.findProjectBySlug(projectSlug, actorOrgId);
    if (!project) {
      throw new NotFoundError({
        message: "Project not found."
      });
    }
    if (project.version === 3) {
      return secretV2BridgeService.moveSecrets({
        sourceEnvironment,
        sourceSecretPath,
        destinationEnvironment,
        destinationSecretPath,
        secretIds,
        projectId: project.id,
        shouldOverwrite,
        actor,
        actorId,
        actorAuthMethod,
        actorOrgId
      });
    }

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      project.id,
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

    const { botKey } = await projectBotService.getBotKey(project.id);
    if (!botKey) {
      throw new BadRequestError({
        message: "Project bot not found. Please upgrade your project.",
        name: "bot_not_found_error"
      });
    }

    const sourceFolder = await folderDAL.findBySecretPath(project.id, sourceEnvironment, sourceSecretPath);
    if (!sourceFolder) {
      throw new NotFoundError({
        message: "Source path does not exist."
      });
    }

    const destinationFolder = await folderDAL.findBySecretPath(
      project.id,
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

    const decryptedSourceSecrets = sourceSecrets.map((secret) => ({
      ...secret,
      secretKey: decryptSymmetric128BitHexKeyUTF8({
        ciphertext: secret.secretKeyCiphertext,
        iv: secret.secretKeyIV,
        tag: secret.secretKeyTag,
        key: botKey
      }),
      secretValue: decryptSymmetric128BitHexKeyUTF8({
        ciphertext: secret.secretValueCiphertext,
        iv: secret.secretValueIV,
        tag: secret.secretValueTag,
        key: botKey
      })
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
          secretKey: decryptSymmetric128BitHexKeyUTF8({
            ciphertext: secret.secretKeyCiphertext,
            iv: secret.secretKeyIV,
            tag: secret.secretKeyTag,
            key: botKey
          }),
          secretValue: decryptSymmetric128BitHexKeyUTF8({
            ciphertext: secret.secretValueCiphertext,
            iv: secret.secretValueIV,
            tag: secret.secretValueTag,
            key: botKey
          })
        };
      });

      const destinationSecretsGroupedByBlindIndex = groupBy(
        decryptedDestinationSecrets.filter(({ secretBlindIndex }) => Boolean(secretBlindIndex)),
        (i) => i.secretBlindIndex as string
      );

      const locallyCreatedSecrets = decryptedSourceSecrets
        .filter(({ secretBlindIndex }) => !destinationSecretsGroupedByBlindIndex[secretBlindIndex as string]?.[0])
        .map((el) => ({ ...el, operation: SecretOperations.Create }));

      const locallyUpdatedSecrets = decryptedSourceSecrets
        .filter(
          ({ secretBlindIndex, secretKey, secretValue }) =>
            destinationSecretsGroupedByBlindIndex[secretBlindIndex as string]?.[0] &&
            // if key or value changed
            (destinationSecretsGroupedByBlindIndex[secretBlindIndex as string]?.[0]?.secretKey !== secretKey ||
              destinationSecretsGroupedByBlindIndex[secretBlindIndex as string]?.[0]?.secretValue !== secretValue)
        )
        .map((el) => ({ ...el, operation: SecretOperations.Update }));

      if (locallyUpdatedSecrets.length > 0 && !shouldOverwrite) {
        const existingKeys = locallyUpdatedSecrets.map((s) => s.secretKey);

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
        project.id,
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
          const localSecret = destinationSecretsGroupedByBlindIndex[doc.secretBlindIndex as string]?.[0];

          return {
            op: operation,
            keyEncoding: doc.keyEncoding,
            algorithm: doc.algorithm,
            requestId: approvalRequestDoc.id,
            metadata: doc.metadata,
            secretKeyIV: doc.secretKeyIV,
            secretKeyTag: doc.secretKeyTag,
            secretKeyCiphertext: doc.secretKeyCiphertext,
            secretValueIV: doc.secretValueIV,
            secretValueTag: doc.secretValueTag,
            secretValueCiphertext: doc.secretValueCiphertext,
            secretBlindIndex: doc.secretBlindIndex,
            secretCommentIV: doc.secretCommentIV,
            secretCommentTag: doc.secretCommentTag,
            secretCommentCiphertext: doc.secretCommentCiphertext,
            skipMultilineEncoding: doc.skipMultilineEncoding,
            // except create operation other two needs the secret id and version id
            ...(operation !== SecretOperations.Create
              ? { secretId: localSecret.id, secretVersion: latestSecretVersions[localSecret.id].id }
              : {})
          };
        });
        await secretApprovalRequestSecretDAL.insertMany(commits, tx);
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
                keyEncoding: doc.keyEncoding,
                algorithm: doc.algorithm,
                type: doc.type,
                metadata: doc.metadata,
                secretKeyIV: doc.secretKeyIV,
                secretKeyTag: doc.secretKeyTag,
                secretKeyCiphertext: doc.secretKeyCiphertext,
                secretValueIV: doc.secretValueIV,
                secretValueTag: doc.secretValueTag,
                secretValueCiphertext: doc.secretValueCiphertext,
                secretBlindIndex: doc.secretBlindIndex,
                secretCommentIV: doc.secretCommentIV,
                secretCommentTag: doc.secretCommentTag,
                secretCommentCiphertext: doc.secretCommentCiphertext,
                skipMultilineEncoding: doc.skipMultilineEncoding
              };
            })
          });
        }
        if (locallyUpdatedSecrets.length) {
          await fnSecretBulkUpdate({
            projectId: project.id,
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
                  id: destinationSecretsGroupedByBlindIndex[doc.secretBlindIndex as string][0].id
                },
                data: {
                  keyEncoding: doc.keyEncoding,
                  algorithm: doc.algorithm,
                  type: doc.type,
                  metadata: doc.metadata,
                  secretKeyIV: doc.secretKeyIV,
                  secretKeyTag: doc.secretKeyTag,
                  secretKeyCiphertext: doc.secretKeyCiphertext,
                  secretValueIV: doc.secretValueIV,
                  secretValueTag: doc.secretValueTag,
                  secretValueCiphertext: doc.secretValueCiphertext,
                  secretBlindIndex: doc.secretBlindIndex,
                  secretCommentIV: doc.secretCommentIV,
                  secretCommentTag: doc.secretCommentTag,
                  secretCommentCiphertext: doc.secretCommentCiphertext,
                  skipMultilineEncoding: doc.skipMultilineEncoding
                }
              };
            })
          });
        }

        isDestinationUpdated = true;
      }

      // Next step is to delete the secrets from the source folder:
      const sourceSecretsGroupByBlindIndex = groupBy(sourceSecrets, (i) => i.secretBlindIndex as string);
      const locallyDeletedSecrets = decryptedSourceSecrets.map((el) => ({ ...el, operation: SecretOperations.Delete }));

      const sourceFolderPolicy = await secretApprovalPolicyService.getSecretApprovalPolicy(
        project.id,
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
          const localSecret = sourceSecretsGroupByBlindIndex[doc.secretBlindIndex as string]?.[0];

          return {
            op: operation,
            keyEncoding: doc.keyEncoding,
            algorithm: doc.algorithm,
            requestId: approvalRequestDoc.id,
            metadata: doc.metadata,
            secretKeyIV: doc.secretKeyIV,
            secretKeyTag: doc.secretKeyTag,
            secretKeyCiphertext: doc.secretKeyCiphertext,
            secretValueIV: doc.secretValueIV,
            secretValueTag: doc.secretValueTag,
            secretValueCiphertext: doc.secretValueCiphertext,
            secretBlindIndex: doc.secretBlindIndex,
            secretCommentIV: doc.secretCommentIV,
            secretCommentTag: doc.secretCommentTag,
            secretCommentCiphertext: doc.secretCommentCiphertext,
            skipMultilineEncoding: doc.skipMultilineEncoding,
            secretId: localSecret.id,
            secretVersion: latestSecretVersions[localSecret.id].id
          };
        });

        await secretApprovalRequestSecretDAL.insertMany(commits, tx);
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
        projectId: project.id,
        secretPath: destinationFolder.path,
        environmentSlug: destinationFolder.environment.slug,
        actorId,
        actor
      });
    }

    if (isSourceUpdated) {
      await snapshotService.performSnapshot(sourceFolder.id);
      await secretQueueService.syncSecrets({
        projectId: project.id,
        secretPath: sourceFolder.path,
        environmentSlug: sourceFolder.environment.slug,
        actorId,
        actor
      });
    }

    return {
      projectId: project.id,
      isSourceUpdated,
      isDestinationUpdated
    };
  };

  const startSecretV2Migration = async ({
    projectId,
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod
  }: TStartSecretsV2MigrationDTO) => {
    const { hasRole } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );

    if (!hasRole(ProjectMembershipRole.Admin))
      throw new BadRequestError({ message: "Only admins are allowed to take this action" });

    const { shouldUseSecretV2Bridge: isProjectV3, project } = await projectBotService.getBotKey(projectId);
    if (isProjectV3) throw new BadRequestError({ message: "project is already in v3" });
    if (project.upgradeStatus === ProjectUpgradeStatus.InProgress)
      throw new BadRequestError({ message: "project is upgrading" });

    await secretQueueService.startSecretV2Migration(projectId);
    return { message: "Migrating project to new KMS architecture" };
  };

  return {
    attachTags,
    detachTags,
    createSecret,
    deleteSecret,
    updateSecret,
    createManySecret,
    updateManySecret,
    deleteManySecret,
    getSecretByName,
    getSecrets,
    getSecretsRaw,
    getSecretByNameRaw,
    createSecretRaw,
    updateSecretRaw,
    deleteSecretRaw,
    createManySecretsRaw,
    updateManySecretsRaw,
    deleteManySecretsRaw,
    getSecretVersions,
    backfillSecretReferences,
    moveSecrets,
    startSecretV2Migration,
    getSecretsCount,
    getSecretsCountMultiEnv,
    getSecretsRawMultiEnv
  };
};
