import { MongoAbility } from "@casl/ability";
import { Knex } from "knex";

import { SecretType } from "@app/db/schemas";
import { Actor, Event, EventType } from "@app/ee/services/audit-log/audit-log-types";
import { AUDIT_LOG_SENSITIVE_VALUE } from "@app/lib/config/const";
import { getConfig } from "@app/lib/config/env";
import { NotFoundError } from "@app/lib/errors";
import { groupBy } from "@app/lib/fn";
import { ActorType } from "@app/services/auth/auth-type";
import { TFolderCommitServiceFactory } from "@app/services/folder-commit/folder-commit-service";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TNotificationServiceFactory } from "@app/services/notification/notification-service";
import { NotificationType } from "@app/services/notification/notification-types";
import { TResourceMetadataDALFactory } from "@app/services/resource-metadata/resource-metadata-dal";
import { TSecretQueueFactory } from "@app/services/secret/secret-queue";
import { SecretOperations } from "@app/services/secret/secret-types";
import { TSecretFolderDALFactory } from "@app/services/secret-folder/secret-folder-dal";
import { TSecretTagDALFactory } from "@app/services/secret-tag/secret-tag-dal";
import { TSecretBlindIndexer } from "@app/services/secret-v2-bridge/secret-blind-index-fns";
import { getAllSecretReferences } from "@app/services/secret-v2-bridge/secret-reference-fns";
import { TSecretV2BridgeDALFactory } from "@app/services/secret-v2-bridge/secret-v2-bridge-dal";
import {
  fnSecretBulkDelete,
  fnSecretBulkInsert,
  fnSecretBulkUpdate,
  fnUpdateMovedSecretReferences,
  fnUpdateSecretLinkedReferences
} from "@app/services/secret-v2-bridge/secret-v2-bridge-fns";
import { TSecretVersionV2DALFactory } from "@app/services/secret-v2-bridge/secret-version-dal";
import { TSecretVersionV2TagDALFactory } from "@app/services/secret-v2-bridge/secret-version-tag-dal";
import { SmtpTemplates, TSmtpService } from "@app/services/smtp/smtp-service";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { ProjectPermissionSet } from "../permission/project-permission";
import { ProjectEvents, TProjectEventPayload } from "../project-events/project-events-types";
import { TSecretApprovalRequestCommitFnsFactory } from "./secret-approval-request-commit-fns";
import { hasSecretUpdateCommitConflict } from "./secret-approval-request-fns";
import { TSecretApprovalRequestSecretDALFactory } from "./secret-approval-request-secret-dal";
import { InternalMetadataType, TInternalMetadata } from "./secret-approval-request-types";

type TSecretApprovalRequestMergeFnsFactoryDep = {
  folderDAL: Pick<TSecretFolderDALFactory, "findBySecretPath" | "findSecretPathByFolderIds">;
  secretV2BridgeDAL: Pick<
    TSecretV2BridgeDALFactory,
    | "insertMany"
    | "upsertSecretReferences"
    | "findBySecretKeys"
    | "bulkUpdate"
    | "deleteMany"
    | "find"
    | "updateById"
    | "findReferencedSecretReferencesBySecretKey"
    | "updateSecretReferenceSecretKey"
    | "updateSecretReferenceEnvAndPath"
    | "findOne"
  >;
  secretVersionV2BridgeDAL: Pick<TSecretVersionV2DALFactory, "insertMany" | "findLatestVersionMany">;
  secretVersionTagV2BridgeDAL: Pick<TSecretVersionV2TagDALFactory, "insertMany">;
  secretTagDAL: Pick<TSecretTagDALFactory, "saveTagsToSecretV2" | "deleteTagsToSecretV2" | "find">;
  resourceMetadataDAL: Pick<TResourceMetadataDALFactory, "insertMany" | "delete">;
  folderCommitService: Pick<TFolderCommitServiceFactory, "createCommit">;
  secretQueueService: Pick<TSecretQueueFactory, "syncSecrets" | "removeSecretReminder">;
  secretApprovalRequestSecretDAL: Pick<TSecretApprovalRequestSecretDALFactory, "updateV2ById">;
  validateSecrets: TSecretApprovalRequestCommitFnsFactory["validateSecrets"];
  userDAL: Pick<TUserDALFactory, "find" | "findOne">;
  notificationService: Pick<TNotificationServiceFactory, "createUserNotifications">;
  smtpService: Pick<TSmtpService, "sendMail">;
};

export type TSecretApprovalRequestMergeFnsFactory = ReturnType<typeof secretApprovalRequestMergeFnsFactory>;

export type TSecretApprovalBridgeCommit = Awaited<
  ReturnType<TSecretApprovalRequestSecretDALFactory["findByRequestIdBridgeSecretV2"]>
>[number];

export type TSecretApprovalCommitConflict = { secretId: string; op: SecretOperations };

export type TSecretManagerCipher = Awaited<ReturnType<TKmsServiceFactory["createCipherPairWithDataKey"]>>;

type TMergedFolder = { path: string; environmentSlug: string; environmentName: string };

export type TMergedSecretsV2Bridge = {
  created: Awaited<ReturnType<typeof fnSecretBulkInsert>>;
  updated: Awaited<ReturnType<typeof fnSecretBulkUpdate>>;
  deleted: Awaited<ReturnType<typeof fnSecretBulkDelete>>;
};

type TAuditSecretMetadata = { key: string; encryptedValue: string; value: string }[];

const toAuditSecretMetadata = (secretMetadata: unknown) =>
  (secretMetadata as TAuditSecretMetadata | undefined)?.map((meta) => ({
    key: meta.key,
    isEncrypted: Boolean(meta.encryptedValue),
    value: meta.encryptedValue ? AUDIT_LOG_SENSITIVE_VALUE : meta.value || ""
  }));

const toAuditSecretTags = (tags: unknown) => (tags as { name: string }[] | undefined)?.map((tag) => tag.name);

export const buildSecretMutationEvents = ({
  environment,
  secretPath,
  secrets: { created, updated, deleted }
}: {
  environment: string;
  secretPath: string;
  secrets: TMergedSecretsV2Bridge;
}): Event[] => {
  const secretMutationEvents: Event[] = [];

  if (created.length) {
    if (created.length > 1) {
      secretMutationEvents.push({
        type: EventType.CREATE_SECRETS,
        metadata: {
          environment,
          secretPath,
          secrets: created.map((secret) => ({
            secretId: secret.id,
            secretVersion: 1,
            secretKey: secret.key,
            secretMetadata: toAuditSecretMetadata(secret.secretMetadata),
            secretTags: toAuditSecretTags(secret.tags)
          }))
        }
      });
    } else {
      const [secret] = created;
      secretMutationEvents.push({
        type: EventType.CREATE_SECRET,
        metadata: {
          environment,
          secretPath,
          secretId: secret.id,
          secretVersion: 1,
          secretKey: secret.key,
          secretMetadata: toAuditSecretMetadata(secret.secretMetadata),
          secretTags: toAuditSecretTags(secret.tags)
        }
      });
    }
  }

  if (updated.length) {
    if (updated.length > 1) {
      secretMutationEvents.push({
        type: EventType.UPDATE_SECRETS,
        metadata: {
          environment,
          secretPath,
          secrets: updated.map((secret) => ({
            secretId: secret.id,
            secretVersion: secret.version,
            secretKey: secret.key,
            secretMetadata: toAuditSecretMetadata(secret.secretMetadata),
            secretTags: toAuditSecretTags(secret.tags)
          }))
        }
      });
    } else {
      const [secret] = updated;
      secretMutationEvents.push({
        type: EventType.UPDATE_SECRET,
        metadata: {
          environment,
          secretPath,
          secretId: secret.id,
          secretVersion: secret.version,
          secretKey: secret.key,
          secretMetadata: toAuditSecretMetadata(secret.secretMetadata),
          secretTags: toAuditSecretTags(secret.tags)
        }
      });
    }
  }

  if (deleted.length) {
    if (deleted.length > 1) {
      secretMutationEvents.push({
        type: EventType.DELETE_SECRETS,
        metadata: {
          environment,
          secretPath,
          secrets: deleted.map((secret) => ({
            secretId: secret.id,
            secretVersion: secret.version,
            secretKey: secret.key
          }))
        }
      });
    } else {
      const [secret] = deleted;
      secretMutationEvents.push({
        type: EventType.DELETE_SECRET,
        metadata: {
          environment,
          secretPath,
          secretId: secret.id,
          secretVersion: secret.version,
          secretKey: secret.key
        }
      });
    }
  }

  return secretMutationEvents;
};

export const buildRequestedByActor = ({
  committerUserId,
  committerUser,
  committerIdentity
}: {
  committerUserId?: string | null;
  committerUser?: { email?: string | null; username?: string | null } | null;
  committerIdentity?: { identityId: string; name: string } | null;
}): Actor | undefined => {
  if (committerUserId) {
    return {
      type: ActorType.USER,
      metadata: {
        userId: committerUserId,
        email: committerUser?.email ?? undefined,
        username: committerUser?.username ?? ""
      }
    };
  }
  if (committerIdentity) {
    return {
      type: ActorType.IDENTITY,
      metadata: { identityId: committerIdentity.identityId, name: committerIdentity.name }
    };
  }
  return undefined;
};

const toSecretMetadataInput = (secretMetadata: unknown) =>
  (Array.isArray(secretMetadata)
    ? (secretMetadata as { key: string; value?: string | null; encryptedValue?: string | null }[])
    : []
  ).map((meta) => ({
    key: meta.key,
    [meta.encryptedValue ? "encryptedValue" : "value"]: meta.encryptedValue
      ? Buffer.from(meta.encryptedValue, "base64")
      : meta.value || ""
  }));

export const secretApprovalRequestMergeFnsFactory = ({
  folderDAL,
  secretV2BridgeDAL,
  secretVersionV2BridgeDAL,
  secretVersionTagV2BridgeDAL,
  secretTagDAL,
  resourceMetadataDAL,
  folderCommitService,
  secretQueueService,
  secretApprovalRequestSecretDAL,
  validateSecrets,
  userDAL,
  notificationService,
  smtpService
}: TSecretApprovalRequestMergeFnsFactoryDep) => {
  const detectSecretApprovalCommitConflicts = async ({
    folderId,
    commits
  }: {
    folderId: string;
    commits: TSecretApprovalBridgeCommit[];
  }) => {
    const conflicts: TSecretApprovalCommitConflict[] = [];

    let creates = commits.filter(({ op }) => op === SecretOperations.Create);
    if (creates.length) {
      const secrets = await secretV2BridgeDAL.findBySecretKeys(
        folderId,
        creates.map((el) => ({ key: el.key, type: SecretType.Shared }))
      );
      const creationConflictSecretsGroupByKey = groupBy(secrets, (i) => i.key);
      creates
        .filter(({ key }) => creationConflictSecretsGroupByKey[key])
        .forEach((el) => {
          conflicts.push({ op: SecretOperations.Create, secretId: el.id });
        });
      creates = creates.filter(({ key }) => !creationConflictSecretsGroupByKey[key]);
    }

    let updates = commits.filter(({ op }) => op === SecretOperations.Update);
    if (updates.length) {
      const secrets = await secretV2BridgeDAL.findBySecretKeys(
        folderId,
        updates.map((el) => ({ key: el.key, type: SecretType.Shared }))
      );
      const updationSecretsGroupByKey = groupBy(secrets, (i) => i.key);
      const hasUpdateConflict = (el: TSecretApprovalBridgeCommit) =>
        hasSecretUpdateCommitConflict(el, updationSecretsGroupByKey[el.key]?.[0]);

      updates.filter(hasUpdateConflict).forEach((el) => {
        conflicts.push({ op: SecretOperations.Update, secretId: el.id });
      });
      updates = updates.filter((el) => !hasUpdateConflict(el));
    }

    const deletes = commits.filter(({ op }) => op === SecretOperations.Delete);

    return { conflicts, creates, updates, deletes };
  };

  const applySecretApprovalCommitsV2Bridge = async ({
    projectId,
    folderId,
    environment,
    envId,
    secretPath,
    actor,
    actorId,
    actorOrgId,
    permission,
    cipher,
    blindIndexer,
    creates,
    updates,
    deletes,
    tx
  }: {
    projectId: string;
    folderId: string;
    environment: string;
    envId: string;
    secretPath: string;
    actor: ActorType;
    actorId: string;
    actorOrgId: string;
    permission: MongoAbility<ProjectPermissionSet>;
    cipher: TSecretManagerCipher;
    blindIndexer: TSecretBlindIndexer;
    creates: TSecretApprovalBridgeCommit[];
    updates: TSecretApprovalBridgeCommit[];
    deletes: TSecretApprovalBridgeCommit[];
    tx: Knex;
  }): Promise<TMergedSecretsV2Bridge> => {
    const { decryptor: secretManagerDecryptor, encryptor: secretManagerEncryptor } = cipher;

    // The request-time check ran before the approvals did. Another write, or another pending
    // request, may have claimed a proposed value since, so the rules are enforced again here,
    // under the same transaction that applies the writes.
    const secretsToValidate = [
      ...creates.map((el) => ({
        key: el.key,
        value: el.encryptedValue ? secretManagerDecryptor({ cipherTextBlob: el.encryptedValue }).toString() : undefined
      })),
      ...updates
        .filter((el) => !el.secret?.isRotatedSecret && (Boolean(el.encryptedValue) || el.key !== el.secret?.key))
        .map((el) => ({
          key: el.key,
          value: el.encryptedValue
            ? secretManagerDecryptor({ cipherTextBlob: el.encryptedValue }).toString()
            : undefined,
          secretId: el.secretId ?? undefined
        }))
    ];

    if (secretsToValidate.length) {
      await validateSecrets({ projectId, environment, envId, secretPath, secrets: secretsToValidate }, permission, tx);
    }

    const creationBlindIndexes = await Promise.all(
      creates.map((el) =>
        el.encryptedValue
          ? blindIndexer.generateBlindIndexes(secretManagerDecryptor({ cipherTextBlob: el.encryptedValue }))
          : Promise.resolve(null)
      )
    );

    const created = creates.length
      ? await fnSecretBulkInsert({
          tx,
          folderId,
          actor: { actorId, type: actor },
          orgId: actorOrgId,
          inputSecrets: creates.map((el, idx) => ({
            tagIds: el?.tags.map(({ id }) => id),
            version: 1,
            encryptedComment: el.encryptedComment,
            encryptedValue: el.encryptedValue,
            blindIndexes: creationBlindIndexes[idx],
            skipMultilineEncoding: el.skipMultilineEncoding,
            key: el.key,
            secretMetadata: toSecretMetadataInput(el.secretMetadata),
            references: el.encryptedValue
              ? getAllSecretReferences(secretManagerDecryptor({ cipherTextBlob: el.encryptedValue }).toString())
                  .nestedReferences
              : [],
            type: SecretType.Shared
          })),
          resourceMetadataDAL,
          secretDAL: secretV2BridgeDAL,
          secretVersionDAL: secretVersionV2BridgeDAL,
          secretTagDAL,
          secretVersionTagDAL: secretVersionTagV2BridgeDAL,
          folderCommitService
        })
      : [];

    // case: move secrets. update references to point to the new location based on metadata source environment and path
    const moveSecretCommits = creates.filter(
      (el) => (el.internalMetadata as TInternalMetadata)?.type === InternalMetadataType.MoveSecret
    );

    if (moveSecretCommits.length > 0 && created.length > 0) {
      const createdSecretsByKey = new Map(created.map((s) => [s.key, s]));

      for await (const moveCommit of moveSecretCommits) {
        const internalMeta = moveCommit.internalMetadata as TInternalMetadata;
        const createdSecret = createdSecretsByKey.get(moveCommit.key);

        // eslint-disable-next-line no-continue
        if (!createdSecret || internalMeta.type !== InternalMetadataType.MoveSecret) continue;

        const { source } = internalMeta.payload;

        const sourceFolder = await folderDAL.findBySecretPath(projectId, source.environment, source.secretPath, tx);
        // eslint-disable-next-line no-continue
        if (!sourceFolder) continue;

        await fnUpdateMovedSecretReferences({
          orgId: actorOrgId,
          projectId,
          sourceEnvironment: source.environment,
          sourceSecretPath: source.secretPath,
          sourceFolderId: sourceFolder.id,
          destinationEnvironment: environment,
          destinationSecretPath: secretPath,
          destinationFolderId: folderId,
          secretKey: moveCommit.key,
          secretId: createdSecret.id,
          secretDAL: secretV2BridgeDAL,
          secretVersionDAL: secretVersionV2BridgeDAL,
          folderCommitService,
          secretQueueService,
          folderDAL,
          encryptor: ({ plainText }) => secretManagerEncryptor({ plainText }),
          decryptor: ({ cipherTextBlob }) => secretManagerDecryptor({ cipherTextBlob }),
          blindIndexer,
          tx
        });
      }
    }

    // Back-fill secretId on approval commit rows so created secrets are traceable
    // This is useful for clients that require polling when a approval request is created
    // for example our terraform provider.
    if (created.length) {
      const newSecretsByKey = new Map(created.map((s) => [s.key, s.id]));
      await Promise.all(
        creates
          .filter((commit) => newSecretsByKey.has(commit.key))
          .map((commit) =>
            secretApprovalRequestSecretDAL.updateV2ById(commit.id, { secretId: newSecretsByKey.get(commit.key)! }, tx)
          )
      );
    }

    const updationBlindIndexes = await Promise.all(
      updates.map((el) => {
        const shouldComputeBlindIndex =
          !el.secret?.isRotatedSecret && el.encryptedValue !== null && el.encryptedValue !== undefined;
        return shouldComputeBlindIndex
          ? blindIndexer.generateBlindIndexes(secretManagerDecryptor({ cipherTextBlob: el.encryptedValue as Buffer }))
          : Promise.resolve(null);
      })
    );

    const updated = updates.length
      ? await fnSecretBulkUpdate({
          folderId,
          orgId: actorOrgId,
          actor: { actorId, type: actor },
          tx,
          inputSecrets: updates.map((el, idx) => {
            const encryptedValue =
              !el.secret?.isRotatedSecret && el.encryptedValue !== null && el.encryptedValue !== undefined
                ? {
                    encryptedValue: el.encryptedValue,
                    blindIndexes: updationBlindIndexes[idx],
                    references: el.encryptedValue
                      ? getAllSecretReferences(secretManagerDecryptor({ cipherTextBlob: el.encryptedValue }).toString())
                          .nestedReferences
                      : []
                  }
                : {};
            return {
              filter: { id: el.secretId as string, type: SecretType.Shared },
              data: {
                reminderRepeatDays: el.reminderRepeatDays,
                encryptedComment: el.encryptedComment !== null ? el.encryptedComment : undefined,
                reminderNote: el.reminderNote,
                skipMultilineEncoding: el.skipMultilineEncoding !== null ? el.skipMultilineEncoding : undefined,
                key: el.key,
                tags: el?.tags.map(({ id }) => id),
                secretMetadata: toSecretMetadataInput(el.secretMetadata),
                ...encryptedValue
              }
            };
          }),
          secretDAL: secretV2BridgeDAL,
          secretVersionDAL: secretVersionV2BridgeDAL,
          secretTagDAL,
          secretVersionTagDAL: secretVersionTagV2BridgeDAL,
          resourceMetadataDAL,
          folderCommitService
        })
      : [];

    // update the ref's for any secret key renames
    const secretKeyRenames = updates.filter((el) => el.secret && el.key !== el.secret.key);

    for await (const rename of secretKeyRenames) {
      // eslint-disable-next-line no-continue
      if (!rename.secret || !rename.secretId) continue;

      await fnUpdateSecretLinkedReferences({
        orgId: actorOrgId,
        projectId,
        environment,
        secretPath,
        folderId,
        oldSecretKey: rename.secret.key,
        newSecretKey: rename.key,
        secretId: rename.secretId,
        secretDAL: secretV2BridgeDAL,
        secretVersionDAL: secretVersionV2BridgeDAL,
        folderCommitService,
        secretQueueService,
        folderDAL,
        encryptor: ({ plainText }) => secretManagerEncryptor({ plainText }),
        decryptor: ({ cipherTextBlob }) => secretManagerDecryptor({ cipherTextBlob }),
        blindIndexer,
        tx
      });
    }

    const deleted = deletes.length
      ? await fnSecretBulkDelete({
          projectId,
          folderId,
          tx,
          actorId,
          actorType: actor,
          secretDAL: secretV2BridgeDAL,
          secretQueueService,
          inputSecrets: deletes.map(({ key }) => ({ secretKey: key, type: SecretType.Shared })),
          folderCommitService,
          secretVersionDAL: secretVersionV2BridgeDAL
        })
      : [];

    return { created, updated, deleted };
  };

  const findMergedFolder = async (projectId: string, folderId: string) => {
    const [folder] = await folderDAL.findSecretPathByFolderIds(projectId, [folderId]);
    if (!folder) {
      throw new NotFoundError({ message: `Folder with ID '${folderId}' not found in project with ID '${projectId}'` });
    }
    return folder;
  };

  const syncMergedSecrets = async ({
    projectId,
    actorOrgId,
    actor,
    actorId,
    folder,
    secrets
  }: {
    projectId: string;
    actorOrgId: string;
    actor: ActorType;
    actorId: string;
    folder: TMergedFolder;
    secrets: TMergedSecretsV2Bridge;
  }) => {
    const events: TProjectEventPayload[] = [];
    if (secrets.created.length > 0) {
      events.push({
        type: ProjectEvents.SecretCreate,
        projectId,
        environment: folder.environmentSlug,
        secretPath: folder.path,
        secretKeys: secrets.created.map((el) => el.key)
      });
    }

    if (secrets.updated.length > 0) {
      events.push({
        type: ProjectEvents.SecretUpdate,
        projectId,
        environment: folder.environmentSlug,
        secretPath: folder.path,
        secretKeys: secrets.updated.map((el) => el.key)
      });
    }

    if (secrets.deleted.length > 0) {
      events.push({
        type: ProjectEvents.SecretDelete,
        projectId,
        environment: folder.environmentSlug,
        secretPath: folder.path,
        secretKeys: secrets.deleted.map((el) => el.key)
      });
    }

    await secretQueueService.syncSecrets({
      projectId,
      orgId: actorOrgId,
      secretPath: folder.path,
      environmentSlug: folder.environmentSlug,
      environmentName: folder.environmentName,
      actorId,
      actor,
      events
    });
  };

  const notifySecretApprovalBypass = async ({
    project,
    environmentName,
    secretPath,
    actorId,
    approverUserIds,
    bypassReason
  }: {
    project: { id: string; name: string; orgId: string };
    environmentName: string;
    secretPath: string;
    actorId: string;
    approverUserIds: string[];
    bypassReason?: string;
  }) => {
    const cfg = getConfig();
    const requestedByUser = await userDAL.findOne({ id: actorId });
    const approverUsers = await userDAL.find({ $in: { id: approverUserIds } });

    await notificationService.createUserNotifications(
      approverUsers.map((approver) => ({
        userId: approver.id,
        orgId: project.orgId,
        type: NotificationType.SECRET_CHANGE_POLICY_BYPASSED,
        title: "Secret Change Policy Bypassed",
        body: `**${requestedByUser.firstName} ${requestedByUser.lastName}** (${requestedByUser.email}) has merged a secret to **${secretPath}** in the **${environmentName}** environment for project **${project.name}** without obtaining the required approval.`,
        link: `/projects/secret-management/${project.id}/approval`
      }))
    );

    const recipients = approverUsers.filter((approver) => approver.email).map((approver) => approver.email!);

    if (recipients?.length) {
      await smtpService.sendMail({
        recipients,
        subjectLine: "Infisical Secret Change Policy Bypassed",
        substitutions: {
          projectName: project.name,
          requesterFullName: `${requestedByUser.firstName} ${requestedByUser.lastName}`,
          requesterEmail: requestedByUser.email,
          bypassReason,
          secretPath,
          environment: environmentName,
          approvalUrl: `${cfg.SITE_URL}/organizations/${project.orgId}/projects/secret-management/${project.id}/approval`
        },
        template: SmtpTemplates.AccessSecretRequestBypassed
      });
    }
  };

  return {
    detectSecretApprovalCommitConflicts,
    applySecretApprovalCommitsV2Bridge,
    findMergedFolder,
    syncMergedSecrets,
    notifySecretApprovalBypass
  };
};
