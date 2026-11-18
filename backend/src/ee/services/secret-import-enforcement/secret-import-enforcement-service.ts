import { posix as posixPath } from "node:path";

import { Knex } from "knex";

import { SecretType } from "@app/db/schemas";
import { EventType, TAuditLogServiceFactory } from "@app/ee/services/audit-log/audit-log-types";
import { TSecretChangePolicyServiceFactory } from "@app/ee/services/secret-change-policy/secret-change-policy-service";
import {
  findOrCreateReplicationFolder,
  getReplicationFolderName
} from "@app/ee/services/secret-replication/secret-replication-fns";
import { chunkArray } from "@app/lib/fn";
import { logger } from "@app/lib/logger";
import { ActorType } from "@app/services/auth/auth-type";
import { EventModificationType } from "@app/services/event-outbox/event-definition";
import { MAX_OUTBOX_ATTEMPTS, TEventEmitter } from "@app/services/event-outbox/event-outbox-types";
import { TFolderCommitServiceFactory } from "@app/services/folder-commit/folder-commit-service";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { TProjectFolderGrantDALFactory } from "@app/services/project-folder-grant/project-folder-grant-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TResourceMetadataDALFactory } from "@app/services/resource-metadata/resource-metadata-dal";
import { TSecretFolderDALFactory } from "@app/services/secret-folder/secret-folder-dal";
import { FolderModifiedEventV1 } from "@app/services/secret-folder/secret-folder-events";
import { TSecretImportDALFactory } from "@app/services/secret-import/secret-import-dal";
import { SecretImportModifiedEventV1 } from "@app/services/secret-import/secret-import-events";
import { fnSecretsV2FromImports, insertReservedImportRow } from "@app/services/secret-import/secret-import-fns";
import { TSecretTagDALFactory } from "@app/services/secret-tag/secret-tag-dal";
import { createSecretBlindIndexer } from "@app/services/secret-v2-bridge/secret-blind-index-fns";
import { emitSecretsModified } from "@app/services/secret-v2-bridge/secret-events";
import { getAllSecretReferences } from "@app/services/secret-v2-bridge/secret-reference-fns";
import { TSecretV2BridgeDALFactory } from "@app/services/secret-v2-bridge/secret-v2-bridge-dal";
import { fnSecretBulkInsert } from "@app/services/secret-v2-bridge/secret-v2-bridge-fns";
import { TSecretVersionV2DALFactory } from "@app/services/secret-v2-bridge/secret-version-dal";
import { TSecretVersionV2TagDALFactory } from "@app/services/secret-v2-bridge/secret-version-tag-dal";

import { TSecretChangePolicyModifiedEventData } from "../secret-change-policy/secret-change-policy-events";
import {
  SecretImportReplicationConversionRequestedEventV1,
  TSecretImportReplicationConversionRequestedEventData
} from "./secret-import-enforcement-events";
import { fingerprintReplicatedSecrets, mergeReplicatedSecrets } from "./secret-import-enforcement-fns";

const CONVERSION_EVENT_BATCH_SIZE = 500;
const COPY_BATCH_SIZE = 500;

export const SOURCE_CHANGED_DURING_CONVERSION_STATUS =
  "The source changed while this import was being converted to a replication import. Resync it to review the changes as a change request.";

export enum SecretImportConversionOutcome {
  Converted = "converted",
  Skipped = "skipped"
}

type TSecretImportEnforcementServiceFactoryDep = {
  secretImportDAL: Pick<
    TSecretImportDALFactory,
    | "findById"
    | "findConvertibleImportsByEnvIds"
    | "lockFolderImportPositions"
    | "lockWithFolderAgainstDelete"
    | "shiftPositionsAfter"
    | "create"
    | "update"
    | "updateById"
    | "find"
    | "findByFolderIds"
    | "findByIds"
    | "primaryNode"
    | "transaction"
  >;
  folderDAL: Pick<
    TSecretFolderDALFactory,
    "findSecretPathByFolderIds" | "findBySecretPath" | "findByManySecretPath" | "findOne" | "create" | "transaction"
  >;
  secretV2BridgeDAL: Pick<
    TSecretV2BridgeDALFactory,
    "find" | "findByFolderIds" | "insertMany" | "upsertSecretReferences" | "delete" | "invalidateSecretCacheByProjectId"
  >;
  secretVersionV2BridgeDAL: Pick<TSecretVersionV2DALFactory, "insertMany" | "findLatestVersionMany">;
  secretVersionV2TagBridgeDAL: Pick<TSecretVersionV2TagDALFactory, "insertMany">;
  secretTagDAL: Pick<TSecretTagDALFactory, "saveTagsToSecretV2" | "find">;
  resourceMetadataDAL: Pick<TResourceMetadataDALFactory, "insertMany">;
  folderCommitService: Pick<TFolderCommitServiceFactory, "createCommit">;
  secretChangePolicyService: Pick<
    TSecretChangePolicyServiceFactory,
    "getSecretApprovalPolicy" | "getSecretApprovalPolicyByPaths"
  >;
  projectDAL: Pick<TProjectDALFactory, "findById">;
  projectFolderGrantDAL: Pick<TProjectFolderGrantDALFactory, "find">;
  orgDAL: Pick<TOrgDALFactory, "findOrgById">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  auditLogService: Pick<TAuditLogServiceFactory, "createAuditLog">;
  eventEmitter: TEventEmitter;
};

export type TSecretImportEnforcementServiceFactory = ReturnType<typeof secretImportEnforcementServiceFactory>;

// The one-time rollout of "Require approval for imported secrets": when a policy change brings existing regular
// imports under it, each is turned into a replication import whose copy holds what the import shows today.
// Nothing else converts imports this way; imports created or repointed later go through a change request.
export const secretImportEnforcementServiceFactory = ({
  secretImportDAL,
  folderDAL,
  secretV2BridgeDAL,
  secretVersionV2BridgeDAL,
  secretVersionV2TagBridgeDAL,
  secretTagDAL,
  resourceMetadataDAL,
  folderCommitService,
  secretChangePolicyService,
  projectDAL,
  projectFolderGrantDAL,
  orgDAL,
  kmsService,
  auditLogService,
  eventEmitter
}: TSecretImportEnforcementServiceFactoryDep) => {
  // Every folder of the environments the policy governed before or after the change is checked against the
  // policy that governs it now, so a change that hands a folder to a broader enforcing policy converts it too.
  const requestConversions = async (data: TSecretChangePolicyModifiedEventData) => {
    const envIds = [...new Set([...data.environmentIds, ...(data.previous?.environmentIds ?? [])])];
    if (!envIds.length) return 0;

    const primary = secretImportDAL.primaryNode();
    const candidates = await secretImportDAL.findConvertibleImportsByEnvIds(envIds, primary);
    if (!candidates.length) return 0;

    const folders = await folderDAL.findSecretPathByFolderIds(
      data.projectId,
      [...new Set(candidates.map(({ folderId }) => folderId))],
      primary
    );
    const folderPathById = new Map(
      folders.filter(Boolean).map((folder) => [folder!.id, folder!.path] as [string, string])
    );

    const candidatesByEnv = new Map<string, typeof candidates>();
    candidates.forEach((candidate) => {
      const group = candidatesByEnv.get(candidate.environmentSlug) ?? [];
      group.push(candidate);
      candidatesByEnv.set(candidate.environmentSlug, group);
    });

    const events: TSecretImportReplicationConversionRequestedEventData[] = [];
    for (const [environment, envCandidates] of candidatesByEnv) {
      const paths = [
        ...new Set(envCandidates.map(({ folderId }) => folderPathById.get(folderId)).filter(Boolean) as string[])
      ];
      // eslint-disable-next-line no-await-in-loop
      const policyByPath = await secretChangePolicyService.getSecretApprovalPolicyByPaths(
        data.projectId,
        environment,
        paths,
        primary
      );
      envCandidates.forEach(({ id, folderId }) => {
        const secretPath = folderPathById.get(folderId);
        const policy = secretPath ? policyByPath.get(secretPath) : undefined;
        if (!secretPath || !policy?.enforceImportReplication) return;
        events.push({
          secretImportId: id,
          secretChangePolicyId: policy.id,
          secretChangePolicyName: policy.name,
          projectId: data.projectId,
          environment,
          secretPath
        });
      });
    }

    for (const batch of chunkArray(events, CONVERSION_EVENT_BATCH_SIZE)) {
      // eslint-disable-next-line no-await-in-loop
      await eventEmitter.emit(batch.map((event) => SecretImportReplicationConversionRequestedEventV1.build(event)));
    }
    return events.length;
  };

  // What the replication job would copy from the source right now, read the way the job reads it. Reads go to the
  // primary: a source change that lands mid-conversion has to show up in the final comparison, and a lagging
  // replica could hide it.
  const $computeSeed = async ({
    projectId,
    orgId,
    sourceEnvironment,
    sourcePath
  }: {
    projectId: string;
    orgId: string;
    sourceEnvironment: string;
    sourcePath: string;
  }) => {
    const primary = secretImportDAL.primaryNode();
    const sourceFolder = await folderDAL.findBySecretPath(projectId, sourceEnvironment, sourcePath, primary);
    if (!sourceFolder) return [];

    const { decryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId
    });
    const decrypt = (value?: Buffer | null) => (value ? decryptor({ cipherTextBlob: value }).toString() : "");

    const sourceLocalSecrets = await secretV2BridgeDAL.find(
      { folderId: sourceFolder.id, type: SecretType.Shared },
      { tx: primary }
    );
    const sourceSecretImports = await secretImportDAL.find({ folderId: sourceFolder.id }, primary);
    const sourceImportedSecrets = await fnSecretsV2FromImports({
      secretImports: sourceSecretImports,
      secretDAL: {
        find: (filter, opts) => secretV2BridgeDAL.find(filter, { ...opts, tx: primary }),
        findByFolderIds: (dto) => secretV2BridgeDAL.findByFolderIds({ ...dto, tx: primary })
      },
      folderDAL: { findByManySecretPath: (query) => folderDAL.findByManySecretPath(query, primary) },
      secretImportDAL: {
        findByFolderIds: (folderIds) => secretImportDAL.findByFolderIds(folderIds, primary),
        findByIds: (ids) => secretImportDAL.findByIds(ids, primary)
      },
      decryptor: decrypt,
      viewSecretValue: true,
      hasSecretAccess: () => true,
      projectId,
      projectFolderGrantDAL: { find: (filter, opts) => projectFolderGrantDAL.find(filter, { ...opts, tx: primary }) },
      actorOrgId: orgId,
      orgDAL,
      kmsService
    });

    // Like the job, only the source's own secrets carry their metadata into the copy.
    return mergeReplicatedSecrets(
      sourceLocalSecrets.map((secret) => ({
        ...secret,
        secretValue: secret.encryptedValue ? decrypt(secret.encryptedValue) : undefined,
        rawSecretMetadata: secret.secretMetadata
      })),
      sourceImportedSecrets
    );
  };

  const $auditOutcome = async ({
    data,
    policy,
    sourceEnvironment,
    sourcePath,
    outcome,
    reason
  }: {
    data: TSecretImportReplicationConversionRequestedEventData;
    policy: { id: string; name: string };
    sourceEnvironment: string;
    sourcePath: string;
    outcome: "converted" | "failed";
    reason?: string;
  }) => {
    try {
      await auditLogService.createAuditLog({
        projectId: data.projectId,
        actor: { type: ActorType.PLATFORM, metadata: {} },
        event: {
          type: EventType.SECRET_IMPORT_REPLICATION_ENFORCED,
          metadata: {
            secretChangePolicyId: policy.id,
            secretChangePolicyName: policy.name,
            secretImportId: data.secretImportId,
            sourceEnvironment,
            sourceSecretPath: sourcePath,
            destinationEnvironment: data.environment,
            destinationSecretPath: data.secretPath,
            outcome,
            reason
          }
        }
      });
    } catch (error) {
      logger.error(error, `Failed to audit a secret import conversion [secretImportId=${data.secretImportId}]`);
    }
  };

  const $convertImport = async (
    data: TSecretImportReplicationConversionRequestedEventData
  ): Promise<SecretImportConversionOutcome> => {
    const { secretImportId, projectId } = data;
    const primary = secretImportDAL.primaryNode();

    const secretImport = await secretImportDAL.findById(secretImportId, primary);
    if (
      !secretImport ||
      secretImport.isReplication ||
      secretImport.isReserved ||
      secretImport.importEnv.projectId !== projectId
    ) {
      return SecretImportConversionOutcome.Skipped;
    }

    const [destinationFolder] = await folderDAL.findSecretPathByFolderIds(projectId, [secretImport.folderId], primary);
    if (!destinationFolder) return SecretImportConversionOutcome.Skipped;

    const policy = await secretChangePolicyService.getSecretApprovalPolicy(
      projectId,
      destinationFolder.environmentSlug,
      destinationFolder.path,
      primary
    );
    if (!policy?.enforceImportReplication) return SecretImportConversionOutcome.Skipped;

    const project = await projectDAL.findById(projectId);
    const sourceEnvironment = secretImport.importEnv.slug;
    const sourcePath = secretImport.importPath;
    const seedInput = { projectId, orgId: project.orgId, sourceEnvironment, sourcePath };

    const seed = await $computeSeed(seedInput);
    const seedFingerprint = fingerprintReplicatedSecrets(seed);
    const blindIndexer = await createSecretBlindIndexer({ projectId, orgId: project.orgId, kmsService });
    const { encryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId
    });
    // The source's own imports can reach another project, whose secrets keep that project's ciphertext, while the
    // copy is read with this project's key. So imported values and comments are encrypted again here, not in the
    // seed, whose fingerprint has to stay stable between the two reads.
    const encrypt = (value: string) => encryptor({ plainText: Buffer.from(value) }).cipherTextBlob;
    const inputSecrets = await Promise.all(
      seed.map(async (secret) => ({
        type: secret.type,
        metadata: secret.metadata ? JSON.stringify(secret.metadata) : [],
        key: secret.key,
        encryptedValue:
          "secretComment" in secret && secret.encryptedValue ? encrypt(secret.secretValue) : secret.encryptedValue,
        encryptedComment:
          "secretComment" in secret && secret.encryptedComment
            ? encrypt(secret.secretComment)
            : secret.encryptedComment,
        skipMultilineEncoding: secret.skipMultilineEncoding,
        secretMetadata: "rawSecretMetadata" in secret ? (secret.rawSecretMetadata ?? undefined) : undefined,
        references: secret.secretValue ? getAllSecretReferences(secret.secretValue).nestedReferences : [],
        blindIndexes: secret.secretValue
          ? await blindIndexer.generateBlindIndexes(Buffer.from(secret.secretValue))
          : null
      }))
    );
    const sourceSecretLatestVersions: Record<string, string> = {};
    const seedByFolderId = new Map<string, string[]>();
    seed.forEach(({ id, folderId }) => seedByFolderId.set(folderId, [...(seedByFolderId.get(folderId) ?? []), id]));
    for (const [folderId, secretIds] of seedByFolderId) {
      // eslint-disable-next-line no-await-in-loop
      const latestVersions = await secretVersionV2BridgeDAL.findLatestVersionMany(folderId, secretIds);
      Object.entries(latestVersions).forEach(([secretId, version]) => {
        sourceSecretLatestVersions[secretId] = version.id;
      });
    }

    const replicationFolderPath = posixPath.join(destinationFolder.path, getReplicationFolderName(secretImportId));
    const replicationFolder = await findOrCreateReplicationFolder({
      folderDAL,
      secretImportDAL,
      destinationSecretImportId: secretImportId,
      destinationFolder,
      onCreate: (createdFolder, tx) =>
        FolderModifiedEventV1.emit(
          eventEmitter,
          {
            folderId: createdFolder.id,
            projectId,
            environment: destinationFolder.environmentSlug,
            secretPath: replicationFolderPath,
            modificationType: EventModificationType.Created
          },
          tx
        )
    });
    if (!replicationFolder) return SecretImportConversionOutcome.Skipped;

    const eventScope = { projectId, environment: destinationFolder.environmentSlug, secretPath: replicationFolderPath };

    // Every write to the copy first checks, under the lock the import's other writers take, that the import is still
    // the regular import this conversion read. Once something else has made it a replication import, readers see the
    // reserved folder and only a change request may fill it.
    const $lockIfStillRegular = async (tx: Knex) => {
      await secretImportDAL.lockFolderImportPositions(destinationFolder.id, tx);
      const locked = await secretImportDAL.lockWithFolderAgainstDelete(
        { importId: secretImportId, folderId: destinationFolder.id, envId: destinationFolder.envId },
        tx
      );
      return Boolean(
        locked &&
        !locked.isReplication &&
        locked.importEnv === secretImport.importEnv.id &&
        locked.importPath === secretImport.importPath
      );
    };

    // Nothing reads the reserved folder until the import points at it, so the copy is written in chunks, each in its
    // own transaction, and the import is flipped afterwards in a short transaction of its own. A retry of this same
    // conversion starts the copy over.
    const isCleared = await secretImportDAL.transaction(async (tx: Knex) => {
      if (!(await $lockIfStillRegular(tx))) return false;
      const staleCopy = await secretV2BridgeDAL.delete({ folderId: replicationFolder.id }, tx);
      if (staleCopy.length) {
        await emitSecretsModified(
          eventEmitter,
          { ...eventScope, modificationType: EventModificationType.Deleted },
          staleCopy,
          tx
        );
      }
      return true;
    });
    if (!isCleared) return SecretImportConversionOutcome.Skipped;
    const copySecrets = inputSecrets.map((secret, index) => ({
      ...secret,
      parentSecretVersionId: sourceSecretLatestVersions[seed[index].id]
    }));
    for (const batch of chunkArray(copySecrets, COPY_BATCH_SIZE)) {
      // eslint-disable-next-line no-await-in-loop
      const isWritten = await secretImportDAL.transaction(async (tx: Knex) => {
        if (!(await $lockIfStillRegular(tx))) return false;
        await fnSecretBulkInsert({
          folderId: replicationFolder.id,
          orgId: project.orgId,
          eventEmitter,
          eventScope,
          secretDAL: secretV2BridgeDAL,
          secretVersionDAL: secretVersionV2BridgeDAL,
          secretTagDAL,
          secretVersionTagDAL: secretVersionV2TagBridgeDAL,
          resourceMetadataDAL,
          folderCommitService,
          inputSecrets: batch,
          tx
        });
        return true;
      });
      if (!isWritten) return SecretImportConversionOutcome.Skipped;
    }

    const converted = await secretImportDAL.transaction(async (tx: Knex) => {
      if (!(await $lockIfStillRegular(tx))) return undefined;

      const [updated] = await secretImportDAL.update(
        { id: secretImportId, folderId: destinationFolder.id },
        { isReplication: true, isReplicationSuccess: true, replicationStatus: null, lastReplicated: new Date() },
        tx
      );
      await insertReservedImportRow(
        secretImportDAL,
        {
          folderId: destinationFolder.id,
          envId: destinationFolder.envId,
          folderPath: destinationFolder.path,
          importId: secretImportId,
          position: updated.position
        },
        tx
      );
      await SecretImportModifiedEventV1.emit(
        eventEmitter,
        {
          secretImportId,
          projectId,
          environment: destinationFolder.environmentSlug,
          secretPath: destinationFolder.path,
          modificationType: EventModificationType.Updated
        },
        tx
      );
      await secretV2BridgeDAL.invalidateSecretCacheByProjectId(projectId, tx);
      return updated;
    });
    if (!converted) return SecretImportConversionOutcome.Skipped;

    // A source write that landed while the copy was being made replicated to nothing, because the import was not
    // a replication import yet. Flag it rather than copy it, so the change still needs approval.
    const currentFingerprint = fingerprintReplicatedSecrets(await $computeSeed(seedInput));
    if (currentFingerprint !== seedFingerprint) {
      await secretImportDAL.updateById(secretImportId, {
        isReplicationSuccess: false,
        replicationStatus: SOURCE_CHANGED_DURING_CONVERSION_STATUS
      });
    }

    await $auditOutcome({ data, policy, sourceEnvironment, sourcePath, outcome: "converted" });
    logger.info(
      `Converted secret import to a replication import [secretImportId=${secretImportId}] [secretChangePolicyId=${data.secretChangePolicyId}] [secrets=${seed.length}]`
    );
    return SecretImportConversionOutcome.Converted;
  };

  const convertImport = async (data: TSecretImportReplicationConversionRequestedEventData, isFinalAttempt: boolean) => {
    try {
      return await $convertImport(data);
    } catch (error) {
      if (isFinalAttempt) {
        const reason = `Infisical could not convert this import to a replication import after ${MAX_OUTBOX_ATTEMPTS} attempts (${error instanceof Error ? error.message.slice(0, 200) : "Unknown error"}). It still reads the source directly, so its changes don't need approval. Save the secret change policy again to retry, or create a replicated import of the same source and delete this one.`;
        const secretImport = await secretImportDAL.findById(data.secretImportId, secretImportDAL.primaryNode());
        // The import keeps reading the source so nothing it serves disappears. The status fields are what the
        // dashboard shows; on a regular import they are only ever set here, and a later conversion clears them.
        try {
          await secretImportDAL.update(
            { id: data.secretImportId, isReplication: false },
            { isReplicationSuccess: false, replicationStatus: reason, lastReplicated: new Date() }
          );
        } catch (statusError) {
          logger.error(
            statusError,
            `Failed to record a failed secret import conversion [secretImportId=${data.secretImportId}]`
          );
        }
        await $auditOutcome({
          data,
          policy: { id: data.secretChangePolicyId, name: data.secretChangePolicyName },
          sourceEnvironment: secretImport?.importEnv.slug ?? "",
          sourcePath: secretImport?.importPath ?? "",
          outcome: "failed",
          reason
        });
      }
      throw error;
    }
  };

  return { requestConversions, convertImport };
};
