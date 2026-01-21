/* eslint-disable no-unreachable-loop */
/* eslint-disable no-await-in-loop */
import { ForbiddenError, subject } from "@casl/ability";

import {
  ActionProjectType,
  ProjectMembershipRole,
  ProjectUpgradeStatus,
  ProjectVersion,
  SecretEncryptionAlgo,
  SecretKeyEncoding,
  SecretsSchema,
  SecretType
} from "@app/db/schemas";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import {
  hasSecretReadValueOrDescribePermission,
  throwIfMissingSecretReadValueOrDescribePermission
} from "@app/ee/services/permission/permission-fns";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionActions,
  ProjectPermissionSecretActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { TSecretApprovalPolicyServiceFactory } from "@app/ee/services/secret-approval-policy/secret-approval-policy-service";
import { TSecretApprovalRequestDALFactory } from "@app/ee/services/secret-approval-request/secret-approval-request-dal";
import { TSecretApprovalRequestSecretDALFactory } from "@app/ee/services/secret-approval-request/secret-approval-request-secret-dal";
import { TSecretApprovalRequestServiceFactory } from "@app/ee/services/secret-approval-request/secret-approval-request-service";
import { TSecretSnapshotServiceFactory } from "@app/ee/services/secret-snapshot/secret-snapshot-service";
import { getConfig } from "@app/lib/config/env";
import { buildSecretBlindIndexFromName, SymmetricKeySize } from "@app/lib/crypto";
import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { groupBy, pick } from "@app/lib/fn";
import { logger } from "@app/lib/logger";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { OrgServiceActor } from "@app/lib/types";
import {
  SecretUpdateMode,
  TGetSecretsRawByFolderMappingsDTO
} from "@app/services/secret-v2-bridge/secret-v2-bridge-types";

import { ActorAuthMethod, ActorType } from "../auth/auth-type";
import { ChangeType } from "../folder-commit/folder-commit-service";
import { TProjectDALFactory } from "../project/project-dal";
import { TProjectBotServiceFactory } from "../project-bot/project-bot-service";
import { TProjectEnvDALFactory } from "../project-env/project-env-dal";
import { TReminderServiceFactory } from "../reminder/reminder-types";
import { TSecretBlindIndexDALFactory } from "../secret-blind-index/secret-blind-index-dal";
import { TSecretFolderDALFactory } from "../secret-folder/secret-folder-dal";
import { TSecretImportDALFactory } from "../secret-import/secret-import-dal";
import { fnSecretsFromImports } from "../secret-import/secret-import-fns";
import { TSecretTagDALFactory } from "../secret-tag/secret-tag-dal";
import { TSecretV2BridgeServiceFactory } from "../secret-v2-bridge/secret-v2-bridge-service";
import { TGetSecretReferencesTreeDTO } from "../secret-v2-bridge/secret-v2-bridge-types";
import { TSecretDALFactory } from "./secret-dal";
import {
  conditionallyHideSecretValue,
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
  TGetAccessibleSecretsDTO,
  TGetASecretByIdRawDTO,
  TGetASecretDTO,
  TGetASecretRawDTO,
  TGetSecretAccessListDTO,
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
  projectDAL: Pick<TProjectDALFactory, "checkProjectUpgradeStatus" | "findProjectBySlug" | "findById">;
  projectEnvDAL: Pick<TProjectEnvDALFactory, "findOne">;
  folderDAL: Pick<
    TSecretFolderDALFactory,
    "findBySecretPath" | "updateById" | "findById" | "findByManySecretPath" | "find" | "findSecretPathByFolderIds"
  >;
  secretV2BridgeService: TSecretV2BridgeServiceFactory;
  secretBlindIndexDAL: TSecretBlindIndexDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission" | "getProjectPermissions">;
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
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  reminderService: Pick<TReminderServiceFactory, "createReminder">;
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
  secretApprovalRequestService,
  licenseService,
  reminderService
}: TSecretServiceFactoryDep) => {
  const getSecretReference = async (projectId: string) => {
    // if bot key missing means e2e still exist
    const projectBot = await projectBotService.getBotKey(projectId).catch(() => null);
    return (el: { ciphertext?: string; iv: string; tag: string }) =>
      projectBot?.botKey
        ? getAllNestedSecretReferences(
            crypto
              .encryption()
              .symmetric()
              .decrypt({
                ciphertext: el.ciphertext || "",
                iv: el.iv,
                tag: el.tag,
                key: projectBot.botKey,
                keySize: SymmetricKeySize.Bits128
              })
          )
        : undefined;
  };

  // utility function to get secret blind index data
  const interalGenSecBlindIndexByName = async (projectId: string, secretName: string) => {
    const appCfg = getConfig();

    const secretBlindIndexDoc = await secretBlindIndexDAL.findOne({ projectId });
    if (!secretBlindIndexDoc) {
      throw new NotFoundError({
        message: `Blind index for project with ID '${projectId}' not found`,
        name: "CreateSecret"
      });
    }

    const secretBlindIndex = await buildSecretBlindIndexFromName({
      secretName,
      keyEncoding: secretBlindIndexDoc.keyEncoding as SecretKeyEncoding,
      rootEncryptionKey: appCfg.ROOT_ENCRYPTION_KEY,
      encryptionKey: appCfg.ENCRYPTION_KEY,
      tag: secretBlindIndexDoc.saltTag,
      ciphertext: secretBlindIndexDoc.encryptedSaltCipherText,
      iv: secretBlindIndexDoc.saltIV
    });
    if (!secretBlindIndex) throw new NotFoundError({ message: `Secret with name '${secretName}' not found` });
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
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionSecretActions.Create,
      subject(ProjectPermissionSub.Secrets, { environment, secretPath: path })
    );

    await projectDAL.checkProjectUpgradeStatus(projectId);

    const folder = await folderDAL.findBySecretPath(projectId, environment, path);
    if (!folder)
      throw new NotFoundError({
        message: `Folder with path '${path}' in environment with slug '${environment}' not found`,
        name: "CreateSecret"
      });
    const folderId = folder.id;

    const blindIndexCfg = await secretBlindIndexDAL.findOne({ projectId });
    if (!blindIndexCfg) {
      throw new NotFoundError({
        message: `Blind index for project with ID '${projectId}' not found`,
        name: "CreateSecret"
      });
    }

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
    if ((inputSecret.tags || []).length !== tags.length)
      throw new NotFoundError({ message: "One or more tags not found" });

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

    if (inputSecret.type === SecretType.Shared) {
      await snapshotService.performSnapshot(folderId);
      await secretQueueService.syncSecrets({
        secretPath: path,
        actorId,
        actor,
        projectId,
        orgId: actorOrgId,
        environmentSlug: folder.environment.slug
      });
    }
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
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionSecretActions.Edit,
      subject(ProjectPermissionSub.Secrets, { environment, secretPath: path })
    );

    await projectDAL.checkProjectUpgradeStatus(projectId);

    if (inputSecret.newSecretName === "") {
      throw new BadRequestError({ message: "New secret name cannot be empty" });
    }

    const folder = await folderDAL.findBySecretPath(projectId, environment, path);
    if (!folder)
      throw new NotFoundError({
        message: `Folder with path '${path}' in environment with slug '${environment}' not found`,
        name: "CreateSecret"
      });
    const folderId = folder.id;

    const blindIndexCfg = await secretBlindIndexDAL.findOne({ projectId });
    if (!blindIndexCfg)
      throw new NotFoundError({
        message: `Blind index for project with ID '${projectId}' not found`,
        name: "CreateSecret"
      });

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
    if ((inputSecret.tags || []).length !== tags.length)
      throw new NotFoundError({ message: "One or more tags not found" });

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

    if (inputSecret.type === SecretType.Shared) {
      await snapshotService.performSnapshot(folderId);
      await secretQueueService.syncSecrets({
        secretPath: path,
        orgId: actorOrgId,
        actorId,
        actor,
        projectId,
        environmentSlug: folder.environment.slug
      });
    }

    const secretValueHidden = !hasSecretReadValueOrDescribePermission(
      permission,
      ProjectPermissionSecretActions.ReadValue,
      {
        environment,
        secretPath: path
      }
    );

    return {
      ...updatedSecret[0],
      ...conditionallyHideSecretValue(secretValueHidden, updatedSecret[0]),
      workspace: projectId,
      environment,
      secretPath: path
    };
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
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionSecretActions.Delete,
      subject(ProjectPermissionSub.Secrets, { environment, secretPath: path })
    );

    await projectDAL.checkProjectUpgradeStatus(projectId);

    const folder = await folderDAL.findBySecretPath(projectId, environment, path);
    if (!folder)
      throw new NotFoundError({
        message: `Folder with path '${path}' in environment with slug '${environment}' not found`,
        name: "DeleteSecret"
      });
    const folderId = folder.id;

    const blindIndexCfg = await secretBlindIndexDAL.findOne({ projectId });
    if (!blindIndexCfg)
      throw new NotFoundError({
        message: `Blind index for project with ID '${projectId}' not found`,
        name: "DeleteSecret"
      });

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

    const deletedSecret = await secretDAL.transaction(async (tx) => {
      const secrets = await fnSecretBulkDelete({
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
      });

      for await (const secret of secrets) {
        if (secret.secretReminderRepeatDays !== null && secret.secretReminderRepeatDays !== undefined) {
          await secretQueueService.removeSecretReminder(
            {
              repeatDays: secret.secretReminderRepeatDays,
              secretId: secret.id,
              projectId
            },
            tx
          );
        }
      }

      return secrets;
    });

    if (inputSecret.type === SecretType.Shared) {
      await snapshotService.performSnapshot(folderId);
      await secretQueueService.syncSecrets({
        secretPath: path,
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
        secretPath: path
      }
    );

    return {
      ...deletedSecret[0],
      ...conditionallyHideSecretValue(secretValueHidden, deletedSecret[0]),
      _id: deletedSecret[0].id,
      workspace: projectId,
      environment,
      secretPath: path
    };
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
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });

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

      if (!deepPaths?.length) {
        throw new NotFoundError({
          message: `Folder with path '${path}' in environment '${environment}' was not found. Please ensure the environment slug and secret path is correct.`,
          name: "SecretPathNotFound"
        });
      }

      paths = deepPaths.map(({ folderId, path: p }) => ({ folderId, path: p }));
    } else {
      throwIfMissingSecretReadValueOrDescribePermission(permission, ProjectPermissionSecretActions.ReadValue, {
        environment,
        secretPath: path
      });

      const folder = await folderDAL.findBySecretPath(projectId, environment, path);
      if (!folder) {
        throw new NotFoundError({
          message: `Folder with path '${path}' in environment '${environment}' was not found. Please ensure the environment slug and secret path is correct.`,
          name: "SecretPathNotFound"
        });
      }

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
          : hasSecretReadValueOrDescribePermission(permission, ProjectPermissionSecretActions.ReadValue, {
              environment: importEnv.slug,
              secretPath: importPath
            })
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
        secretReminderRecipients: [],
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
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
    throwIfMissingSecretReadValueOrDescribePermission(permission, ProjectPermissionSecretActions.ReadValue, {
      environment,
      secretPath: path
    });

    const folder = await folderDAL.findBySecretPath(projectId, environment, path);
    if (!folder)
      throw new NotFoundError({
        message: `Folder with path '${path}' in environment with slug '${environment}' not found`,
        name: "GetSecretByName"
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
          : hasSecretReadValueOrDescribePermission(permission, ProjectPermissionSecretActions.ReadValue, {
              environment: importEnv.slug,
              secretPath: importPath
            })
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
              secretValueHidden: false,
              workspace: projectId,
              environment: importedSecrets[i].environment,
              secretPath: importedSecrets[i].secretPath
            };
          }
        }
      }
    }
    if (!secret) throw new NotFoundError({ message: `Secret with name '${secretName}' not found` });

    return {
      ...secret,
      secretValueHidden: false, // Always false because we check permission at the beginning of the function
      workspace: projectId,
      environment,
      secretPath: path
    };
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
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionSecretActions.Create,
      subject(ProjectPermissionSub.Secrets, { environment, secretPath: path })
    );

    await projectDAL.checkProjectUpgradeStatus(projectId);

    const folder = await folderDAL.findBySecretPath(projectId, environment, path);
    if (!folder)
      throw new NotFoundError({
        message: `Folder with path '${path}' in environment with slug '${environment}' not found`,
        name: "CreateManySecret"
      });
    const folderId = folder.id;

    const blindIndexCfg = await secretBlindIndexDAL.findOne({ projectId });
    if (!blindIndexCfg) throw new NotFoundError({ message: "Blind index not found", name: "Create secret" });

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
    if (tags.length !== tagIds.length) throw new NotFoundError({ message: "One or more tags not found" });

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
      orgId: actorOrgId,
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
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionSecretActions.Edit,
      subject(ProjectPermissionSub.Secrets, { environment, secretPath: path })
    );

    await projectDAL.checkProjectUpgradeStatus(projectId);

    const folder = await folderDAL.findBySecretPath(projectId, environment, path);
    if (!folder)
      throw new NotFoundError({
        message: `Folder with path '${path}' in environment with slug '${environment}' not found`,
        name: "UpdateManySecret"
      });
    const folderId = folder.id;

    const blindIndexCfg = await secretBlindIndexDAL.findOne({ projectId });
    if (!blindIndexCfg) throw new NotFoundError({ message: "Blind index not found", name: "Update secret" });

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
    if (tagIds.length !== tags.length) throw new NotFoundError({ message: "One or more tags not found" });

    const references = await getSecretReference(projectId);
    const secrets = await secretDAL.transaction(async (tx) => {
      const updatedSecrets = await fnSecretBulkUpdate({
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
      });

      const secretValueHidden = !hasSecretReadValueOrDescribePermission(
        permission,
        ProjectPermissionSecretActions.ReadValue,
        {
          environment,
          secretPath: path
        }
      );

      return updatedSecrets.map((secret) => ({
        ...secret,
        ...conditionallyHideSecretValue(secretValueHidden, secret)
      }));
    });

    await snapshotService.performSnapshot(folderId);
    await secretQueueService.syncSecrets({
      actor,
      actorId,
      secretPath: path,
      projectId,
      orgId: actorOrgId,
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
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionSecretActions.Delete,
      subject(ProjectPermissionSub.Secrets, { environment, secretPath: path })
    );

    await projectDAL.checkProjectUpgradeStatus(projectId);

    const folder = await folderDAL.findBySecretPath(projectId, environment, path);
    if (!folder)
      throw new NotFoundError({
        message: `Folder with path '${path}' in environment with slug '${environment}' not found`,
        name: "DeleteManySecret"
      });
    const folderId = folder.id;

    const blindIndexCfg = await secretBlindIndexDAL.findOne({ projectId });
    if (!blindIndexCfg)
      throw new NotFoundError({
        message: `Blind index for project with ID '${projectId}' not found`,
        name: "DeleteManySecret"
      });

    const { keyName2BlindIndex } = await fnSecretBlindIndexCheck({
      inputSecrets,
      folderId,
      isNew: false,
      blindIndexCfg,
      secretDAL
    });

    const secretsDeleted = await secretDAL.transaction(async (tx) => {
      const secrets = await fnSecretBulkDelete({
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
      });

      for await (const secret of secrets) {
        if (secret.secretReminderRepeatDays !== null && secret.secretReminderRepeatDays !== undefined) {
          await secretQueueService.removeSecretReminder(
            {
              repeatDays: secret.secretReminderRepeatDays,
              secretId: secret.id,
              projectId
            },
            tx
          );
        }
      }
      const secretValueHidden = !hasSecretReadValueOrDescribePermission(
        permission,
        ProjectPermissionSecretActions.ReadValue,
        {
          environment,
          secretPath: path
        }
      );

      return secrets.map((secret) => ({
        ...secret,
        ...conditionallyHideSecretValue(secretValueHidden, secret)
      }));
    });

    await snapshotService.performSnapshot(folderId);
    await secretQueueService.syncSecrets({
      actor,
      actorId,
      secretPath: path,
      projectId,
      orgId: actorOrgId,
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
    | "includeTagsInSearch"
    | "includeMetadataInSearch"
    | "excludeRotatedSecrets"
  >) => {
    const { shouldUseSecretV2Bridge } = await projectBotService.getBotKey(projectId);

    if (!shouldUseSecretV2Bridge)
      throw new BadRequestError({
        message: "Project version does not support pagination",
        name: "PaginationNotSupportedError"
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
        name: "PaginationNotSupportedError"
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
        name: "PaginationNotSupportError"
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

  const getSecretReferenceTree = async (dto: TGetSecretReferencesTreeDTO) => {
    const { shouldUseSecretV2Bridge } = await projectBotService.getBotKey(dto.projectId);

    if (!shouldUseSecretV2Bridge)
      throw new BadRequestError({
        message: "Project version does not support secret reference tree",
        name: "SecretReferenceTreeNotSupported"
      });

    return secretV2BridgeService.getSecretReferenceTree(dto);
  };

  const getSecretAccessList = async (dto: TGetSecretAccessListDTO) => {
    const { environment, secretPath, secretName, projectId } = dto;
    const plan = await licenseService.getPlan(dto.actorOrgId);
    if (!plan.secretAccessInsights) {
      throw new BadRequestError({
        message: "Failed to fetch secret access list due to plan restriction. Upgrade your plan."
      });
    }

    const secret = await secretV2BridgeService.getSecretByName({
      actor: dto.actor,
      actorId: dto.actorId,
      actorOrgId: dto.actorOrgId,
      actorAuthMethod: dto.actorAuthMethod,
      projectId,
      secretName,
      path: secretPath,
      environment,
      viewSecretValue: false,
      type: "shared"
    });

    const { userPermissions, identityPermissions, groupPermissions } = await permissionService.getProjectPermissions(
      dto.projectId,
      dto.actorOrgId
    );

    const attachAllowedActions = (
      entityPermission:
        | (typeof userPermissions)[number]
        | (typeof identityPermissions)[number]
        | (typeof groupPermissions)[number]
    ) => {
      const allowedActions = [
        ProjectPermissionSecretActions.DescribeSecret,
        ProjectPermissionSecretActions.ReadValue,
        ProjectPermissionSecretActions.Delete,
        ProjectPermissionSecretActions.Create,
        ProjectPermissionSecretActions.Edit
      ].filter((action) => {
        if (
          action === ProjectPermissionSecretActions.DescribeSecret ||
          action === ProjectPermissionSecretActions.ReadValue
        ) {
          return hasSecretReadValueOrDescribePermission(entityPermission.permission, action, {
            environment,
            secretPath,
            secretName,
            secretTags: secret?.tags?.map((el) => el.slug)
          });
        }

        return entityPermission.permission.can(
          action,
          subject(ProjectPermissionSub.Secrets, {
            environment,
            secretPath,
            secretName,
            secretTags: secret?.tags?.map((el) => el.slug)
          })
        );
      });

      return {
        ...entityPermission,
        allowedActions
      };
    };

    const usersWithAccess = userPermissions.map(attachAllowedActions).filter((user) => user.allowedActions.length > 0);
    const identitiesWithAccess = identityPermissions
      .map(attachAllowedActions)
      .filter((identity) => identity.allowedActions.length > 0);
    const groupsWithAccess = groupPermissions
      .map(attachAllowedActions)
      .filter((group) => group.allowedActions.length > 0);

    return { users: usersWithAccess, identities: identitiesWithAccess, groups: groupsWithAccess };
  };

  const getAccessibleSecrets = async ({
    projectId,
    secretPath,
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    environment,
    filterByAction,
    recursive
  }: TGetAccessibleSecretsDTO) => {
    const { shouldUseSecretV2Bridge } = await projectBotService.getBotKey(projectId);

    if (!shouldUseSecretV2Bridge) {
      throw new BadRequestError({
        message: "Project version does not support this endpoint.",
        name: "ProjectVersionNotSupported"
      });
    }

    const secrets = await secretV2BridgeService.getAccessibleSecrets({
      projectId,
      secretPath,
      environment,
      filterByAction,
      actor,
      actorId,
      actorOrgId,
      actorAuthMethod,
      recursive
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
    viewSecretValue,
    environment,
    includeImports,
    expandSecretReferences,
    recursive,
    tagSlugs = [],
    throwOnMissingReadValuePermission = true,
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
        viewSecretValue,
        throwOnMissingReadValuePermission,
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
      throw new NotFoundError({
        message: `Project bot for project with ID '${projectId}' not found. Please upgrade your project.`,
        name: "bot_not_found_error"
      });

    if (paramsV2.metadataFilter) {
      throw new BadRequestError({
        message: "Please upgrade your project to filter secrets by metadata",
        name: "SecretMetadataNotSupported"
      });
    }

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

    const decryptedSecrets = secrets.map((el) => decryptSecretRaw({ ...el, secretValueHidden: false }, botKey));
    const filteredSecrets = tagSlugs.length
      ? decryptedSecrets.filter((secret) => Boolean(secret.tags?.find((el) => tagSlugs.includes(el.slug))))
      : decryptedSecrets;
    const processedImports = (imports || [])?.map(({ secrets: importedSecrets, ...el }) => {
      const decryptedImportSecrets = importedSecrets.map((sec) =>
        decryptSecretRaw(
          {
            ...sec,
            environment: el.environment,
            workspace: projectId,
            secretPath: el.secretPath,
            secretValueHidden: false
          },
          botKey
        )
      );

      // secret-override to handle duplicate keys from different import levels
      // this prioritizes secret values from direct imports
      const importedKeys = new Set<string>();
      const importedEntries = decryptedImportSecrets.reduce(
        (
          accum: {
            secretValueHidden: boolean;
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
              if (decryptedSecret.secretValueHidden) return;
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
              if (decryptedSecret.secretValueHidden) return;
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

  const getSecretByIdRaw = async ({ secretId, actorId, actor, actorOrgId, actorAuthMethod }: TGetASecretByIdRawDTO) => {
    const secret = await secretV2BridgeService.getSecretById({
      secretId,
      actorId,
      actor,
      actorOrgId,
      actorAuthMethod
    });

    return secret;
  };

  const getSecretByNameRaw = async ({
    type,
    path,
    actor,
    environment,
    viewSecretValue,
    projectId,
    expandSecretReferences,
    actorId,
    actorOrgId,
    actorAuthMethod,
    secretName,
    includeImports,
    version
  }: TGetASecretRawDTO) => {
    const { botKey, shouldUseSecretV2Bridge } = await projectBotService.getBotKey(projectId);
    if (shouldUseSecretV2Bridge) {
      const secret = await secretV2BridgeService.getSecretByName({
        environment,
        projectId,
        includeImports,
        actorAuthMethod,
        path,
        viewSecretValue,
        actorOrgId,
        actor,
        actorId,
        version,
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
      throw new NotFoundError({
        message: `Project bot for project with ID '${projectId}' not found. Please upgrade your project.`,
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

    return {
      secretMetadata: undefined,
      ...decryptedSecret
    };
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
    secretReminderRepeatDays,
    secretMetadata
  }: TCreateSecretRawDTO) => {
    const { botKey, shouldUseSecretV2Bridge } = await projectBotService.getBotKey(projectId);
    const project = await projectDAL.findById(projectId);
    if (project.enforceCapitalization) {
      if (secretName !== secretName.toUpperCase()) {
        throw new BadRequestError({
          message:
            "Secret name must be in UPPERCASE per project requirements. You can disable this requirement in project settings."
        });
      }
    }

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
                secretMetadata
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
        secretReminderRepeatDays,
        secretMetadata
      });
      return { secret, type: SecretProtectionType.Direct as const };
    }

    if (!botKey)
      throw new NotFoundError({
        message: `Project bot for project with ID '${projectId}' not found. Please upgrade your project.`,
        name: "bot_not_found_error"
      });

    const secretKeyEncrypted = crypto.encryption().symmetric().encrypt({
      plaintext: secretName,
      key: botKey,
      keySize: SymmetricKeySize.Bits128
    });
    const secretValueEncrypted = crypto
      .encryption()
      .symmetric()
      .encrypt({
        plaintext: secretValue || "",
        key: botKey,
        keySize: SymmetricKeySize.Bits128
      });
    const secretCommentEncrypted = crypto
      .encryption()
      .symmetric()
      .encrypt({
        plaintext: secretComment || "",
        key: botKey,
        keySize: SymmetricKeySize.Bits128
      });
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

    return {
      type: SecretProtectionType.Direct as const,
      secret: decryptSecretRaw(
        {
          ...secret,
          secretValueHidden: false
        },
        botKey
      )
    };
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
    secretReminderRecipients,
    metadata,
    secretComment,
    newSecretName,
    secretMetadata
  }: TUpdateSecretRawDTO) => {
    const { botKey, shouldUseSecretV2Bridge } = await projectBotService.getBotKey(projectId);
    const project = await projectDAL.findById(projectId);
    if (project.enforceCapitalization) {
      if (newSecretName && newSecretName !== newSecretName.toUpperCase()) {
        throw new BadRequestError({
          message:
            "Secret name must be in UPPERCASE per project requirements. You can disable this requirement in project settings."
        });
      }
    }

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
                secretMetadata
              }
            ]
          }
        });
        return { type: SecretProtectionType.Approval as const, approval };
      }
      const secret = await secretV2BridgeService.updateSecret({
        skipMultilineEncoding,
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
        secretValue,
        secretMetadata
      });

      if (secretReminderRepeatDays) {
        await reminderService.createReminder({
          actor,
          actorId,
          actorOrgId,
          actorAuthMethod,
          reminder: {
            secretId: secret.id,
            message: secretReminderNote,
            repeatDays: secretReminderRepeatDays,
            recipients: secretReminderRecipients
          }
        });
      }
      return { type: SecretProtectionType.Direct as const, secret };
    }

    if (!botKey)
      throw new NotFoundError({
        message: `Project bot for project with ID '${projectId}' not found. Please upgrade your project.`,
        name: "bot_not_found_error"
      });

    const secretValueEncrypted = crypto
      .encryption()
      .symmetric()
      .encrypt({
        plaintext: secretValue || "",
        key: botKey,
        keySize: SymmetricKeySize.Bits128
      });
    const secretCommentEncrypted = crypto
      .encryption()
      .symmetric()
      .encrypt({
        plaintext: secretComment || "",
        key: botKey,
        keySize: SymmetricKeySize.Bits128
      });

    const secretKeyEncrypted = crypto
      .encryption()
      .symmetric()
      .encrypt({
        plaintext: newSecretName || secretName,
        key: botKey,
        keySize: SymmetricKeySize.Bits128
      });

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
      throw new NotFoundError({
        message: `Project bot for project with ID '${projectId}' not found. Please upgrade your project.`,
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
      if (!project) throw new NotFoundError({ message: `Project with slug '${projectSlug}' not found` });
      projectId = project.id;
    }

    const { botKey, shouldUseSecretV2Bridge } = await projectBotService.getBotKey(projectId);
    const policy =
      actor === ActorType.USER
        ? await secretApprovalPolicyService.getSecretApprovalPolicy(projectId, environment, secretPath)
        : undefined;

    if (shouldUseSecretV2Bridge) {
      const project = await projectDAL.findById(projectId);
      if (project.enforceCapitalization) {
        const caseViolatingSecretKeys = inputSecrets
          .filter((sec) => sec.secretKey !== sec.secretKey.toUpperCase())
          .map((sec) => sec.secretKey);

        if (caseViolatingSecretKeys.length) {
          throw new BadRequestError({
            message: `Secret names must be in UPPERCASE per project requirements: ${caseViolatingSecretKeys.join(
              ", "
            )}. You can disable this requirement in project settings`
          });
        }
      }

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
              secretKey: el.secretKey,
              secretMetadata: el.secretMetadata
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
      throw new NotFoundError({
        message: `Project bot for project with ID '${projectId}' not found. Please upgrade your project.`,
        name: "bot_not_found_error"
      });

    const sanitizedSecrets = inputSecrets.map(
      ({ secretComment, secretKey, metadata, tagIds, secretValue, skipMultilineEncoding }) => {
        const secretKeyEncrypted = crypto.encryption().symmetric().encrypt({
          plaintext: secretKey,
          key: botKey,
          keySize: SymmetricKeySize.Bits128
        });
        const secretValueEncrypted = crypto
          .encryption()
          .symmetric()
          .encrypt({
            plaintext: secretValue || "",
            key: botKey,
            keySize: SymmetricKeySize.Bits128
          });
        const secretCommentEncrypted = crypto
          .encryption()
          .symmetric()
          .encrypt({
            plaintext: secretComment || "",
            key: botKey,
            keySize: SymmetricKeySize.Bits128
          });
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
        decryptSecretRaw({ ...secret, workspace: projectId, environment, secretPath, secretValueHidden: false }, botKey)
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
    mode = SecretUpdateMode.FailOnNotFound,
    secrets: inputSecrets = []
  }: TUpdateManySecretRawDTO) => {
    if (!projectSlug && !optionalProjectId)
      throw new BadRequestError({ message: "Must provide either project slug or projectId" });

    let projectId = optionalProjectId as string;
    if (!optionalProjectId && projectSlug) {
      const project = await projectDAL.findProjectBySlug(projectSlug, actorOrgId);
      if (!project) throw new NotFoundError({ message: `Project with slug '${projectSlug}' not found` });
      projectId = project.id;
    }

    const { botKey, shouldUseSecretV2Bridge } = await projectBotService.getBotKey(projectId);
    const policy =
      actor === ActorType.USER
        ? await secretApprovalPolicyService.getSecretApprovalPolicy(projectId, environment, secretPath)
        : undefined;
    if (shouldUseSecretV2Bridge) {
      const project = await projectDAL.findById(projectId);
      if (project.enforceCapitalization) {
        const caseViolatingSecretKeys = inputSecrets
          .filter((sec) => sec.newSecretName && sec.newSecretName !== sec.newSecretName.toUpperCase())
          .map((sec) => sec.newSecretName);

        if (caseViolatingSecretKeys.length) {
          throw new BadRequestError({
            message: `Secret names must be in UPPERCASE per project requirements: ${caseViolatingSecretKeys.join(
              ", "
            )}. You can disable this requirement in project settings`
          });
        }
      }

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
              secretKey: el.secretKey,
              secretMetadata: el.secretMetadata
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
        secrets: inputSecrets,
        mode
      });

      await Promise.all(
        inputSecrets
          .filter((el) => el.secretReminderRepeatDays)
          .map(async (secret) => {
            await reminderService.createReminder({
              actor,
              actorId,
              actorOrgId,
              actorAuthMethod,
              reminder: {
                secretId: secrets.find(
                  (el) =>
                    (el.secretKey === secret.secretKey || el.secretKey === secret.newSecretName) &&
                    el.secretPath === (secret.secretPath || secretPath)
                )?.id,
                message: secret.secretReminderNote,
                repeatDays: secret.secretReminderRepeatDays
              }
            });
          })
      );

      return { type: SecretProtectionType.Direct as const, secrets };
    }

    if (!botKey)
      throw new NotFoundError({
        message: `Project bot for project with ID '${projectId}' not found. Please upgrade your project.`,
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
        const secretKeyEncrypted = crypto
          .encryption()
          .symmetric()
          .encrypt({
            plaintext: newSecretName || secretKey,
            key: botKey,
            keySize: SymmetricKeySize.Bits128
          });
        const secretValueEncrypted = crypto
          .encryption()
          .symmetric()
          .encrypt({
            plaintext: secretValue || "",
            key: botKey,
            keySize: SymmetricKeySize.Bits128
          });
        const secretCommentEncrypted = crypto
          .encryption()
          .symmetric()
          .encrypt({
            plaintext: secretComment || "",
            key: botKey,
            keySize: SymmetricKeySize.Bits128
          });
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
      if (!project) throw new NotFoundError({ message: `Project with slug '${projectSlug}' not found` });
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
      throw new NotFoundError({
        message: `Project bot for project with ID '${projectId}' not found. Please upgrade your project.`,
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
    secretId,
    secretVersions: filterSecretVersions
  }: TGetSecretVersionsDTO) => {
    const secretVersionV2 = await secretV2BridgeService
      .getSecretVersions({
        actorId,
        actor,
        actorOrgId,
        actorAuthMethod,
        limit,
        offset,
        secretId,
        secretVersions: filterSecretVersions
      })
      .catch((err) => {
        if ((err as Error).message === "BadRequest: Failed to find secret") {
          return null;
        }
      });
    if (secretVersionV2) return secretVersionV2;

    const secret = await secretDAL.findById(secretId);
    if (!secret) throw new NotFoundError({ message: `Secret with ID '${secretId}' not found` });
    const folder = await folderDAL.findById(secret.folderId);
    if (!folder) throw new NotFoundError({ message: `Folder with ID '${secret.folderId}' not found` });

    const [folderWithPath] = await folderDAL.findSecretPathByFolderIds(folder.projectId, [folder.id]);

    if (!folderWithPath) {
      throw new NotFoundError({ message: `Folder with ID '${folder.id}' not found` });
    }

    const { botKey } = await projectBotService.getBotKey(folder.projectId);
    if (!botKey)
      throw new NotFoundError({ message: `Project bot for project with ID '${folder.projectId}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: folder.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.SecretRollback);
    const secretVersions = await secretVersionDAL.findBySecretId(secretId, {
      offset,
      limit,
      sort: [["createdAt", "desc"]]
    });

    return secretVersions.map((el) => {
      const secretKey = crypto.encryption().symmetric().decrypt({
        ciphertext: secret.secretKeyCiphertext,
        iv: secret.secretKeyIV,
        tag: secret.secretKeyTag,
        key: botKey,
        keySize: SymmetricKeySize.Bits128
      });

      const secretValueHidden = !hasSecretReadValueOrDescribePermission(
        permission,
        ProjectPermissionSecretActions.ReadValue,
        {
          environment: folder.environment.envSlug,
          secretPath: folderWithPath.path,
          secretName: secretKey,
          ...(el.tags?.length && {
            secretTags: el.tags.map((tag) => tag.slug)
          })
        }
      );

      return decryptSecretRaw(
        {
          secretValueHidden,
          ...el,
          workspace: folder.projectId,
          environment: folder.environment.envSlug,
          secretPath: folderWithPath.path
        },
        botKey
      );
    });
  };

  const getSecretVersionsV2ByIds = async ({
    actorId,
    actor,
    actorOrgId,
    actorAuthMethod,
    secretId,
    secretVersions,
    secretPath,
    envId,
    projectId
  }: TGetSecretVersionsDTO & {
    secretVersions: string[];
    secretPath: string;
    envId: string;
    projectId: string;
  }) => {
    const secretVersionV2 = await secretV2BridgeService.getSecretVersionsByIds({
      actorId,
      actor,
      actorOrgId,
      actorAuthMethod,
      secretId,
      secretVersionNumbers: secretVersions,
      secretPath,
      envId,
      projectId
    });
    return secretVersionV2;
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
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: project.id,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionSecretActions.Edit,
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
      throw new NotFoundError({ message: `Secret with name '${secretName}' not found` });
    }
    const folder = await folderDAL.findBySecretPath(project.id, environment, secretPath);

    if (!folder) {
      throw new NotFoundError({
        message: `Folder with path '${secretPath}' in environment with slug '${environment}' not found`
      });
    }

    const tags = await secretTagDAL.find({
      projectId: project.id,
      $in: {
        slug: tagSlugs
      }
    });

    if (tags.length !== tagSlugs.length) {
      throw new NotFoundError({ message: "One or more tags not found." });
    }

    const existingSecretTags = await secretDAL.getSecretTags(secret.id);

    if (existingSecretTags.some((tag) => tagSlugs.includes(tag.slug))) {
      throw new BadRequestError({ message: "One or more tags already exists on the secret" });
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
      orgId: project.orgId,
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
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: project.id,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionSecretActions.Edit,
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
      throw new NotFoundError({ message: `Secret with name '${secretName}' not found` });
    }
    const folder = await folderDAL.findBySecretPath(project.id, environment, secretPath);

    if (!folder) {
      throw new NotFoundError({
        message: `Folder with path '${secretPath}' in environment with slug '${environment}' not found`
      });
    }

    const tags = await secretTagDAL.find({
      projectId: project.id,
      $in: {
        slug: tagSlugs
      }
    });

    if (tags.length !== tagSlugs.length) {
      throw new NotFoundError({ message: "One or more tags not found." });
    }

    const existingSecretTags = await secretDAL.getSecretTags(secret.id);

    // Make sure all the tags exist on the secret
    const tagIdsToRemove = tags.map((tag) => tag.id);
    const secretTagIds = existingSecretTags.map((tag) => tag.id);

    if (!tagIdsToRemove.every((el) => secretTagIds.includes(el))) {
      throw new NotFoundError({ message: "One or more tags not found on the secret" });
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
      orgId: project.orgId,
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
    const { hasRole } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    if (!hasRole(ProjectMembershipRole.Admin))
      throw new ForbiddenRequestError({ message: "Only admins are allowed to take this action" });

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
      throw new NotFoundError({
        message: `Project bot for project with ID '${projectId}' not found. Please upgrade your project.`,
        name: "bot_not_found_error"
      });

    await secretDAL.transaction(async (tx) => {
      const secrets = await secretDAL.findAllProjectSecretValues(projectId, tx);
      await secretDAL.upsertSecretReferences(
        secrets.map(({ id, secretValueCiphertext, secretValueIV, secretValueTag }) => ({
          secretId: id,
          references: getAllNestedSecretReferences(
            crypto.encryption().symmetric().decrypt({
              ciphertext: secretValueCiphertext,
              iv: secretValueIV,
              tag: secretValueTag,
              key: botKey,
              keySize: SymmetricKeySize.Bits128
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
    actorOrgId,
    projectId: inputProjectId
  }: TMoveSecretsDTO) => {
    let project;
    if (projectSlug) {
      project = await projectDAL.findProjectBySlug(projectSlug, actorOrgId);
    } else if (inputProjectId) {
      project = await projectDAL.findById(inputProjectId);
    }

    if (!project) {
      throw new NotFoundError({
        message: `Project with slug '${projectSlug}' not found`
      });
    }

    const projectId = project.id;
    if (project.version === ProjectVersion.V3) {
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

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: project.id,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    const { botKey } = await projectBotService.getBotKey(project.id);
    if (!botKey) {
      throw new NotFoundError({
        message: `Project bot for project with ID '${project.id}' not found. Please upgrade your project.`,
        name: "bot_not_found_error"
      });
    }

    const sourceFolder = await folderDAL.findBySecretPath(project.id, sourceEnvironment, sourceSecretPath);
    if (!sourceFolder) {
      throw new NotFoundError({
        message: `Source folder with path '${sourceSecretPath}' in environment with slug '${sourceEnvironment}' not found`
      });
    }

    const destinationFolder = await folderDAL.findBySecretPath(
      project.id,
      destinationEnvironment,
      destinationSecretPath
    );

    if (!destinationFolder) {
      throw new NotFoundError({
        message: `Destination folder with path '${destinationSecretPath}' in environment with slug '${destinationEnvironment}' not found`
      });
    }

    const sourceSecrets = await secretDAL.findManySecretsWithTags({
      type: SecretType.Shared,
      secretIds
    });

    if (sourceSecrets.length !== secretIds.length) {
      throw new BadRequestError({
        message: "Invalid secrets"
      });
    }

    const sourceActions = [
      ProjectPermissionSecretActions.Delete,
      ProjectPermissionSecretActions.DescribeSecret,
      ProjectPermissionSecretActions.ReadValue
    ] as const;
    const destinationActions = [ProjectPermissionSecretActions.Create, ProjectPermissionSecretActions.Edit] as const;

    const decryptedSourceSecrets = sourceSecrets.map((secret) => {
      const secretKey = crypto.encryption().symmetric().decrypt({
        ciphertext: secret.secretKeyCiphertext,
        iv: secret.secretKeyIV,
        tag: secret.secretKeyTag,
        key: botKey,
        keySize: SymmetricKeySize.Bits128
      });

      for (const destinationAction of destinationActions) {
        ForbiddenError.from(permission).throwUnlessCan(
          destinationAction,
          subject(ProjectPermissionSub.Secrets, {
            environment: destinationEnvironment,
            secretPath: destinationSecretPath
          })
        );
      }

      for (const sourceAction of sourceActions) {
        if (
          sourceAction === ProjectPermissionSecretActions.ReadValue ||
          sourceAction === ProjectPermissionSecretActions.DescribeSecret
        ) {
          throwIfMissingSecretReadValueOrDescribePermission(permission, sourceAction, {
            environment: sourceEnvironment,
            secretPath: sourceSecretPath
          });
        } else {
          ForbiddenError.from(permission).throwUnlessCan(
            sourceAction,
            subject(ProjectPermissionSub.Secrets, {
              environment: sourceEnvironment,
              secretPath: sourceSecretPath
            })
          );
        }
      }

      return {
        ...secret,
        secretKey,
        secretValue: crypto.encryption().symmetric().decrypt({
          ciphertext: secret.secretValueCiphertext,
          iv: secret.secretValueIV,
          tag: secret.secretValueTag,
          key: botKey,
          keySize: SymmetricKeySize.Bits128
        })
      };
    });

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
          secretKey: crypto.encryption().symmetric().decrypt({
            ciphertext: secret.secretKeyCiphertext,
            iv: secret.secretKeyIV,
            tag: secret.secretKeyTag,
            key: botKey,
            keySize: SymmetricKeySize.Bits128
          }),
          secretValue: crypto.encryption().symmetric().decrypt({
            ciphertext: secret.secretValueCiphertext,
            iv: secret.secretValueIV,
            tag: secret.secretValueTag,
            key: botKey,
            keySize: SymmetricKeySize.Bits128
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
            projectId,
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
        orgId: project.orgId,
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
        orgId: project.orgId,
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
    const { hasRole } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    if (!hasRole(ProjectMembershipRole.Admin))
      throw new ForbiddenRequestError({ message: "Only admins are allowed to take this action" });

    const { shouldUseSecretV2Bridge: isProjectV3, project } = await projectBotService.getBotKey(projectId);
    if (isProjectV3) throw new BadRequestError({ message: "Project is already V3" });
    if (project.upgradeStatus === ProjectUpgradeStatus.InProgress)
      throw new BadRequestError({ message: "Project is already being upgraded" });

    await secretQueueService.startSecretV2Migration(projectId);
    return { message: "Migrating project to new KMS architecture" };
  };

  const getSecretsRawByFolderMappings = async (
    params: Omit<TGetSecretsRawByFolderMappingsDTO, "userId">,
    actor: OrgServiceActor
  ) => {
    const { shouldUseSecretV2Bridge } = await projectBotService.getBotKey(params.projectId);

    if (!shouldUseSecretV2Bridge) throw new BadRequestError({ message: "Project version not supported" });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      projectId: params.projectId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    const secrets = secretV2BridgeService.getSecretsByFolderMappings({ ...params, userId: actor.id }, permission);

    return secrets;
  };

  const getChangeVersions = async (
    change: {
      secretVersion: string;
      secretId?: string;
      id?: string;
      isUpdate?: boolean;
      changeType?: string;
    },
    previousVersion: string,
    actorId: string,
    actor: ActorType,
    actorOrgId: string,
    actorAuthMethod: ActorAuthMethod,
    envId: string,
    projectId: string,
    secretPath: string
  ) => {
    const currentVersion = change.secretVersion;
    const secretId = change.secretId ? change.secretId : change.id;
    if (!secretId) {
      return;
    }
    const versions = await getSecretVersionsV2ByIds({
      actorId,
      actor,
      actorOrgId,
      actorAuthMethod,
      secretId,
      // if it's update add also the previous secretversionid
      secretVersions:
        change.isUpdate || change.changeType === ChangeType.UPDATE
          ? [currentVersion, previousVersion]
          : [currentVersion],
      secretPath,
      envId,
      projectId
    });
    return versions?.map((v) => ({
      secretKey: v.secretKey,
      secretComment: v.secretComment,
      skipMultilineEncoding: v.skipMultilineEncoding,
      tags: v.tags?.map((tag) => tag.slug),
      metadata: v.secretMetadata,
      secretValue: v.secretValue
    }));
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
    getSecretsRawMultiEnv,
    getSecretReferenceTree,
    getSecretsRawByFolderMappings,
    getSecretAccessList,
    getSecretByIdRaw,
    getAccessibleSecrets,
    getSecretVersionsV2ByIds,
    getChangeVersions
  };
};
