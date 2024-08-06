import { SecretType, TSecrets, TSecretsV2 } from "@app/db/schemas";
import { TSecretApprovalPolicyServiceFactory } from "@app/ee/services/secret-approval-policy/secret-approval-policy-service";
import { TSecretApprovalRequestDALFactory } from "@app/ee/services/secret-approval-request/secret-approval-request-dal";
import { TSecretApprovalRequestSecretDALFactory } from "@app/ee/services/secret-approval-request/secret-approval-request-secret-dal";
import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";
import { decryptSymmetric128BitHexKeyUTF8 } from "@app/lib/crypto";
import { BadRequestError } from "@app/lib/errors";
import { groupBy, unique } from "@app/lib/fn";
import { logger } from "@app/lib/logger";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { QueueName, TQueueServiceFactory } from "@app/queue";
import { ActorType } from "@app/services/auth/auth-type";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { TProjectBotServiceFactory } from "@app/services/project-bot/project-bot-service";
import { TSecretDALFactory } from "@app/services/secret/secret-dal";
import { fnSecretBulkInsert, fnSecretBulkUpdate } from "@app/services/secret/secret-fns";
import { TSecretQueueFactory, uniqueSecretQueueKey } from "@app/services/secret/secret-queue";
import { SecretOperations } from "@app/services/secret/secret-types";
import { TSecretVersionDALFactory } from "@app/services/secret/secret-version-dal";
import { TSecretVersionTagDALFactory } from "@app/services/secret/secret-version-tag-dal";
import { TSecretFolderDALFactory } from "@app/services/secret-folder/secret-folder-dal";
import { ReservedFolders } from "@app/services/secret-folder/secret-folder-types";
import { TSecretImportDALFactory } from "@app/services/secret-import/secret-import-dal";
import { fnSecretsFromImports, fnSecretsV2FromImports } from "@app/services/secret-import/secret-import-fns";
import { TSecretTagDALFactory } from "@app/services/secret-tag/secret-tag-dal";
import { TSecretV2BridgeDALFactory } from "@app/services/secret-v2-bridge/secret-v2-bridge-dal";
import {
  fnSecretBulkInsert as fnSecretV2BridgeBulkInsert,
  fnSecretBulkUpdate as fnSecretV2BridgeBulkUpdate,
  getAllNestedSecretReferences,
  getAllNestedSecretReferences as getAllNestedSecretReferencesV2Bridge
} from "@app/services/secret-v2-bridge/secret-v2-bridge-fns";
import { TSecretVersionV2DALFactory } from "@app/services/secret-v2-bridge/secret-version-dal";
import { TSecretVersionV2TagDALFactory } from "@app/services/secret-v2-bridge/secret-version-tag-dal";

import { MAX_REPLICATION_DEPTH } from "./secret-replication-constants";

type TSecretReplicationServiceFactoryDep = {
  secretDAL: Pick<
    TSecretDALFactory,
    "find" | "findByBlindIndexes" | "insertMany" | "bulkUpdate" | "delete" | "upsertSecretReferences" | "transaction"
  >;
  secretVersionDAL: Pick<TSecretVersionDALFactory, "find" | "insertMany" | "update" | "findLatestVersionMany">;
  secretV2BridgeDAL: Pick<
    TSecretV2BridgeDALFactory,
    "find" | "findBySecretKeys" | "insertMany" | "bulkUpdate" | "delete" | "upsertSecretReferences" | "transaction"
  >;
  secretVersionV2BridgeDAL: Pick<
    TSecretVersionV2DALFactory,
    "find" | "insertMany" | "update" | "findLatestVersionMany"
  >;
  secretImportDAL: Pick<TSecretImportDALFactory, "find" | "updateById" | "findByFolderIds">;
  folderDAL: Pick<
    TSecretFolderDALFactory,
    "findSecretPathByFolderIds" | "findBySecretPath" | "create" | "findOne" | "findByManySecretPath"
  >;
  secretVersionTagDAL: Pick<TSecretVersionTagDALFactory, "find" | "insertMany">;
  secretVersionV2TagBridgeDAL: Pick<TSecretVersionV2TagDALFactory, "find" | "insertMany">;
  secretQueueService: Pick<TSecretQueueFactory, "syncSecrets" | "replicateSecrets">;
  queueService: Pick<TQueueServiceFactory, "start" | "listen" | "queue" | "stopJobById">;
  secretApprovalPolicyService: Pick<TSecretApprovalPolicyServiceFactory, "getSecretApprovalPolicy">;
  keyStore: Pick<TKeyStoreFactory, "acquireLock" | "setItemWithExpiry" | "getItem">;
  secretTagDAL: Pick<
    TSecretTagDALFactory,
    | "findManyTagsById"
    | "saveTagsToSecret"
    | "deleteTagsManySecret"
    | "find"
    | "saveTagsToSecretV2"
    | "deleteTagsToSecretV2"
  >;
  secretApprovalRequestDAL: Pick<TSecretApprovalRequestDALFactory, "create" | "transaction">;
  secretApprovalRequestSecretDAL: Pick<
    TSecretApprovalRequestSecretDALFactory,
    "insertMany" | "insertApprovalSecretTags" | "insertV2Bridge"
  >;

  projectBotService: Pick<TProjectBotServiceFactory, "getBotKey">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
};

export type TSecretReplicationServiceFactory = ReturnType<typeof secretReplicationServiceFactory>;
const SECRET_IMPORT_SUCCESS_LOCK = 10;

const keystoreReplicationSuccessKey = (jobId: string, secretImportId: string) => `${jobId}-${secretImportId}`;
const getReplicationKeyLockPrefix = (projectId: string, environmentSlug: string, secretPath: string) =>
  `REPLICATION_SECRET_${projectId}-${environmentSlug}-${secretPath}`;
export const getReplicationFolderName = (importId: string) => `${ReservedFolders.SecretReplication}${importId}`;

const getDecryptedKeyValue = (key: string, secret: TSecrets) => {
  const secretKey = decryptSymmetric128BitHexKeyUTF8({
    ciphertext: secret.secretKeyCiphertext,
    iv: secret.secretKeyIV,
    tag: secret.secretKeyTag,
    key
  });

  const secretValue = decryptSymmetric128BitHexKeyUTF8({
    ciphertext: secret.secretValueCiphertext,
    iv: secret.secretValueIV,
    tag: secret.secretValueTag,
    key
  });
  return { key: secretKey, value: secretValue };
};

export const secretReplicationServiceFactory = ({
  secretDAL,
  queueService,
  secretVersionDAL,
  secretImportDAL,
  keyStore,
  secretVersionTagDAL,
  secretTagDAL,
  folderDAL,
  secretApprovalPolicyService,
  secretApprovalRequestSecretDAL,
  secretApprovalRequestDAL,
  secretQueueService,
  projectBotService,
  secretVersionV2TagBridgeDAL,
  secretVersionV2BridgeDAL,
  secretV2BridgeDAL,
  kmsService
}: TSecretReplicationServiceFactoryDep) => {
  const $getReplicatedSecrets = (
    botKey: string,
    localSecrets: TSecrets[],
    importedSecrets: { secrets: TSecrets[] }[]
  ) => {
    const deDupe = new Set<string>();
    const secrets = localSecrets
      .filter(({ secretBlindIndex }) => Boolean(secretBlindIndex))
      .map((el) => {
        const decryptedSecret = getDecryptedKeyValue(botKey, el);
        deDupe.add(decryptedSecret.key);
        return { ...el, secretKey: decryptedSecret.key, secretValue: decryptedSecret.value };
      });

    for (let i = importedSecrets.length - 1; i >= 0; i = -1) {
      importedSecrets[i].secrets.forEach((el) => {
        const decryptedSecret = getDecryptedKeyValue(botKey, el);
        if (deDupe.has(decryptedSecret.key) || !el.secretBlindIndex) {
          return;
        }
        deDupe.add(decryptedSecret.key);
        secrets.push({ ...el, secretKey: decryptedSecret.key, secretValue: decryptedSecret.value });
      });
    }
    return secrets;
  };

  const $getReplicatedSecretsV2 = (
    localSecrets: (TSecretsV2 & { secretKey: string; secretValue?: string })[],
    importedSecrets: { secrets: (TSecretsV2 & { secretKey: string; secretValue?: string })[] }[]
  ) => {
    const deDupe = new Set<string>();
    const secrets = [...localSecrets];

    for (let i = importedSecrets.length - 1; i >= 0; i = -1) {
      importedSecrets[i].secrets.forEach((el) => {
        if (deDupe.has(el.key)) {
          return;
        }
        deDupe.add(el.key);
        secrets.push(el);
      });
    }
    return secrets;
  };

  // IMPORTANT NOTE BEFORE READING THE FUNCTION
  // SOURCE - Where secrets are copied from
  // DESTINATION - Where the replicated imports that points to SOURCE from Destination
  queueService.start(QueueName.SecretReplication, async (job) => {
    logger.info(job.data, "Replication started");
    const {
      secretPath,
      environmentSlug,
      projectId,
      actorId,
      actor,
      pickOnlyImportIds,
      _deDupeReplicationQueue: deDupeReplicationQueue,
      _deDupeQueue: deDupeQueue,
      _depth: depth = 0
    } = job.data;
    if (depth > MAX_REPLICATION_DEPTH) return;

    const folder = await folderDAL.findBySecretPath(projectId, environmentSlug, secretPath);
    if (!folder) return;
    const { botKey, shouldUseSecretV2Bridge } = await projectBotService.getBotKey(projectId);

    // the the replicated imports made to the source. These are the destinations
    const destinationSecretImports = await secretImportDAL.find({
      importPath: secretPath,
      importEnv: folder.envId
    });

    // CASE: normal mode <- link import  <- replicated import
    const nonReplicatedDestinationImports = destinationSecretImports.filter(({ isReplication }) => !isReplication);
    if (nonReplicatedDestinationImports.length) {
      // keep calling sync secret for all the imports made
      const importedFolderIds = unique(nonReplicatedDestinationImports, (i) => i.folderId).map(
        ({ folderId }) => folderId
      );
      const importedFolders = await folderDAL.findSecretPathByFolderIds(projectId, importedFolderIds);
      const foldersGroupedById = groupBy(importedFolders.filter(Boolean), (i) => i?.id as string);
      await Promise.all(
        nonReplicatedDestinationImports
          .filter(({ folderId }) => Boolean(foldersGroupedById[folderId][0]?.path as string))
          // filter out already synced ones
          .filter(
            ({ folderId }) =>
              !deDupeQueue?.[
                uniqueSecretQueueKey(
                  foldersGroupedById[folderId][0]?.environmentSlug as string,
                  foldersGroupedById[folderId][0]?.path as string
                )
              ]
          )
          .map(({ folderId }) =>
            secretQueueService.replicateSecrets({
              projectId,
              secretPath: foldersGroupedById[folderId][0]?.path as string,
              environmentSlug: foldersGroupedById[folderId][0]?.environmentSlug as string,
              actorId,
              actor,
              _depth: depth + 1,
              _deDupeReplicationQueue: deDupeReplicationQueue,
              _deDupeQueue: deDupeQueue
            })
          )
      );
    }

    let destinationReplicatedSecretImports = destinationSecretImports.filter(({ isReplication }) =>
      Boolean(isReplication)
    );
    destinationReplicatedSecretImports = pickOnlyImportIds
      ? destinationReplicatedSecretImports.filter(({ id }) => pickOnlyImportIds?.includes(id))
      : destinationReplicatedSecretImports;
    if (!destinationReplicatedSecretImports.length) return;

    if (shouldUseSecretV2Bridge) {
      const { decryptor: secretManagerDecryptor } = await kmsService.createCipherPairWithDataKey({
        type: KmsDataKey.SecretManager,
        projectId
      });

      // these are the secrets to be added in replicated folders
      const sourceLocalSecrets = await secretV2BridgeDAL.find({ folderId: folder.id, type: SecretType.Shared });
      const sourceSecretImports = await secretImportDAL.find({ folderId: folder.id });
      const sourceImportedSecrets = await fnSecretsV2FromImports({
        allowedImports: sourceSecretImports,
        secretDAL: secretV2BridgeDAL,
        folderDAL,
        secretImportDAL,
        decryptor: (value) => (value ? secretManagerDecryptor({ cipherTextBlob: value }).toString() : undefined)
      });
      // secrets that gets replicated across imports
      const sourceDecryptedLocalSecrets = sourceLocalSecrets.map((el) => ({
        ...el,
        secretKey: el.key,
        secretValue: el.encryptedValue
          ? secretManagerDecryptor({ cipherTextBlob: el.encryptedValue }).toString()
          : undefined
      }));
      const sourceSecrets = $getReplicatedSecretsV2(sourceDecryptedLocalSecrets, sourceImportedSecrets);
      const sourceSecretsGroupByKey = groupBy(sourceSecrets, (i) => i.key);

      const lock = await keyStore.acquireLock(
        [getReplicationKeyLockPrefix(projectId, environmentSlug, secretPath)],
        5000
      );

      try {
        /*  eslint-disable no-await-in-loop */
        for (const destinationSecretImport of destinationReplicatedSecretImports) {
          try {
            const hasJobCompleted = await keyStore.getItem(
              keystoreReplicationSuccessKey(job.id as string, destinationSecretImport.id),
              KeyStorePrefixes.SecretReplication
            );
            if (hasJobCompleted) {
              logger.info(
                { jobId: job.id, importId: destinationSecretImport.id },
                "Skipping this job as this has been successfully replicated."
              );
              // eslint-disable-next-line
              continue;
            }

            const [destinationFolder] = await folderDAL.findSecretPathByFolderIds(projectId, [
              destinationSecretImport.folderId
            ]);
            if (!destinationFolder) throw new BadRequestError({ message: "Imported folder not found" });

            let destinationReplicationFolder = await folderDAL.findOne({
              parentId: destinationFolder.id,
              name: getReplicationFolderName(destinationSecretImport.id),
              isReserved: true
            });
            if (!destinationReplicationFolder) {
              destinationReplicationFolder = await folderDAL.create({
                parentId: destinationFolder.id,
                name: getReplicationFolderName(destinationSecretImport.id),
                envId: destinationFolder.envId,
                isReserved: true
              });
            }
            const destinationReplicationFolderId = destinationReplicationFolder.id;

            const destinationLocalSecretsFromDB = await secretV2BridgeDAL.find({
              folderId: destinationReplicationFolderId
            });
            const destinationLocalSecrets = destinationLocalSecretsFromDB.map((el) => ({
              ...el,
              secretKey: el.key,
              secretValue: el.encryptedValue
                ? secretManagerDecryptor({ cipherTextBlob: el.encryptedValue }).toString()
                : undefined
            }));

            const destinationLocalSecretsGroupedByKey = groupBy(destinationLocalSecrets, (i) => i.key);

            const locallyCreatedSecrets = sourceSecrets
              .filter(({ key }) => !destinationLocalSecretsGroupedByKey[key]?.[0])
              .map((el) => ({ ...el, operation: SecretOperations.Create })); // rewrite update ops to create

            const locallyUpdatedSecrets = sourceSecrets
              .filter(
                ({ key, secretKey, secretValue }) =>
                  destinationLocalSecretsGroupedByKey[key]?.[0] &&
                  // if key or value changed
                  (destinationLocalSecretsGroupedByKey[key]?.[0]?.secretKey !== secretKey ||
                    destinationLocalSecretsGroupedByKey[key]?.[0]?.secretValue !== secretValue)
              )
              .map((el) => ({ ...el, operation: SecretOperations.Update })); // rewrite update ops to create

            const locallyDeletedSecrets = destinationLocalSecrets
              .filter(({ key }) => !sourceSecretsGroupByKey[key]?.[0])
              .map((el) => ({ ...el, operation: SecretOperations.Delete }));

            const isEmtpy =
              locallyCreatedSecrets.length + locallyUpdatedSecrets.length + locallyDeletedSecrets.length === 0;
            // eslint-disable-next-line
            if (isEmtpy) continue;

            const policy = await secretApprovalPolicyService.getSecretApprovalPolicy(
              projectId,
              destinationFolder.environmentSlug,
              destinationFolder.path
            );
            // this means it should be a approval request rather than direct replication
            if (policy && actor === ActorType.USER) {
              const localSecretsLatestVersions = destinationLocalSecrets.map(({ id }) => id);
              const latestSecretVersions = await secretVersionV2BridgeDAL.findLatestVersionMany(
                destinationReplicationFolderId,
                localSecretsLatestVersions
              );
              await secretApprovalRequestDAL.transaction(async (tx) => {
                const approvalRequestDoc = await secretApprovalRequestDAL.create(
                  {
                    folderId: destinationReplicationFolderId,
                    slug: alphaNumericNanoId(),
                    policyId: policy.id,
                    status: "open",
                    hasMerged: false,
                    committerUserId: actorId,
                    isReplicated: true
                  },
                  tx
                );
                const commits = locallyCreatedSecrets
                  .concat(locallyUpdatedSecrets)
                  .concat(locallyDeletedSecrets)
                  .map((doc) => {
                    const { operation } = doc;
                    const localSecret = destinationLocalSecretsGroupedByKey[doc.key]?.[0];

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
                const approvalCommits = await secretApprovalRequestSecretDAL.insertV2Bridge(commits, tx);

                return { ...approvalRequestDoc, commits: approvalCommits };
              });
            } else {
              await secretDAL.transaction(async (tx) => {
                if (locallyCreatedSecrets.length) {
                  await fnSecretV2BridgeBulkInsert({
                    folderId: destinationReplicationFolderId,
                    secretVersionDAL: secretVersionV2BridgeDAL,
                    secretDAL: secretV2BridgeDAL,
                    tx,
                    secretTagDAL,
                    secretVersionTagDAL: secretVersionV2TagBridgeDAL,
                    inputSecrets: locallyCreatedSecrets.map((doc) => {
                      return {
                        type: doc.type,
                        metadata: doc.metadata,
                        key: doc.key,
                        encryptedValue: doc.encryptedValue,
                        encryptedComment: doc.encryptedComment,
                        skipMultilineEncoding: doc.skipMultilineEncoding,
                        references: doc.secretValue ? getAllNestedSecretReferencesV2Bridge(doc.secretValue) : []
                      };
                    })
                  });
                }
                if (locallyUpdatedSecrets.length) {
                  await fnSecretV2BridgeBulkUpdate({
                    folderId: destinationReplicationFolderId,
                    secretVersionDAL: secretVersionV2BridgeDAL,
                    secretDAL: secretV2BridgeDAL,
                    tx,
                    secretTagDAL,
                    secretVersionTagDAL: secretVersionV2TagBridgeDAL,
                    inputSecrets: locallyUpdatedSecrets.map((doc) => {
                      return {
                        filter: {
                          folderId: destinationReplicationFolderId,
                          id: destinationLocalSecretsGroupedByKey[doc.key][0].id
                        },
                        data: {
                          type: doc.type,
                          metadata: doc.metadata,
                          key: doc.key,
                          encryptedValue: doc.encryptedValue as Buffer,
                          encryptedComment: doc.encryptedComment,
                          skipMultilineEncoding: doc.skipMultilineEncoding,
                          references: doc.secretValue ? getAllNestedSecretReferencesV2Bridge(doc.secretValue) : []
                        }
                      };
                    })
                  });
                }
                if (locallyDeletedSecrets.length) {
                  await secretDAL.delete(
                    {
                      $in: {
                        id: locallyDeletedSecrets.map(({ id }) => id)
                      },
                      folderId: destinationReplicationFolderId
                    },
                    tx
                  );
                }
              });

              await secretQueueService.syncSecrets({
                projectId,
                secretPath: destinationFolder.path,
                environmentSlug: destinationFolder.environmentSlug,
                actorId,
                actor,
                _depth: depth + 1,
                _deDupeReplicationQueue: deDupeReplicationQueue,
                _deDupeQueue: deDupeQueue
              });
            }

            // this is used to avoid multiple times generating secret approval by failed one
            await keyStore.setItemWithExpiry(
              keystoreReplicationSuccessKey(job.id as string, destinationSecretImport.id),
              SECRET_IMPORT_SUCCESS_LOCK,
              1,
              KeyStorePrefixes.SecretReplication
            );

            await secretImportDAL.updateById(destinationSecretImport.id, {
              lastReplicated: new Date(),
              replicationStatus: null,
              isReplicationSuccess: true
            });
          } catch (err) {
            logger.error(
              err,
              `Failed to replicate secret with import id=[${destinationSecretImport.id}] env=[${destinationSecretImport.importEnv.slug}] path=[${destinationSecretImport.importPath}]`
            );
            await secretImportDAL.updateById(destinationSecretImport.id, {
              lastReplicated: new Date(),
              replicationStatus: (err as Error)?.message.slice(0, 500),
              isReplicationSuccess: false
            });
          }
        }
        /*  eslint-enable no-await-in-loop */
      } finally {
        await lock.release();
        logger.info(job.data, "Replication finished");
      }
      return;
    }

    if (!botKey) throw new BadRequestError({ message: "Bot not found" });
    // these are the secrets to be added in replicated folders
    const sourceLocalSecrets = await secretDAL.find({ folderId: folder.id, type: SecretType.Shared });
    const sourceSecretImports = await secretImportDAL.find({ folderId: folder.id });
    const sourceImportedSecrets = await fnSecretsFromImports({
      allowedImports: sourceSecretImports,
      secretDAL,
      folderDAL,
      secretImportDAL
    });
    // secrets that gets replicated across imports
    const sourceSecrets = $getReplicatedSecrets(botKey, sourceLocalSecrets, sourceImportedSecrets);
    const sourceSecretsGroupByBlindIndex = groupBy(sourceSecrets, (i) => i.secretBlindIndex as string);

    const lock = await keyStore.acquireLock(
      [getReplicationKeyLockPrefix(projectId, environmentSlug, secretPath)],
      5000
    );

    try {
      /*  eslint-disable no-await-in-loop */
      for (const destinationSecretImport of destinationReplicatedSecretImports) {
        try {
          const hasJobCompleted = await keyStore.getItem(
            keystoreReplicationSuccessKey(job.id as string, destinationSecretImport.id),
            KeyStorePrefixes.SecretReplication
          );
          if (hasJobCompleted) {
            logger.info(
              { jobId: job.id, importId: destinationSecretImport.id },
              "Skipping this job as this has been successfully replicated."
            );
            // eslint-disable-next-line
            continue;
          }

          const [destinationFolder] = await folderDAL.findSecretPathByFolderIds(projectId, [
            destinationSecretImport.folderId
          ]);
          if (!destinationFolder) throw new BadRequestError({ message: "Imported folder not found" });

          let destinationReplicationFolder = await folderDAL.findOne({
            parentId: destinationFolder.id,
            name: getReplicationFolderName(destinationSecretImport.id),
            isReserved: true
          });
          if (!destinationReplicationFolder) {
            destinationReplicationFolder = await folderDAL.create({
              parentId: destinationFolder.id,
              name: getReplicationFolderName(destinationSecretImport.id),
              envId: destinationFolder.envId,
              isReserved: true
            });
          }
          const destinationReplicationFolderId = destinationReplicationFolder.id;

          const destinationLocalSecretsFromDB = await secretDAL.find({
            folderId: destinationReplicationFolderId
          });
          const destinationLocalSecrets = destinationLocalSecretsFromDB.map((el) => {
            const decryptedSecret = getDecryptedKeyValue(botKey, el);
            return { ...el, secretKey: decryptedSecret.key, secretValue: decryptedSecret.value };
          });

          const destinationLocalSecretsGroupedByBlindIndex = groupBy(
            destinationLocalSecrets.filter(({ secretBlindIndex }) => Boolean(secretBlindIndex)),
            (i) => i.secretBlindIndex as string
          );

          const locallyCreatedSecrets = sourceSecrets
            .filter(
              ({ secretBlindIndex }) => !destinationLocalSecretsGroupedByBlindIndex[secretBlindIndex as string]?.[0]
            )
            .map((el) => ({ ...el, operation: SecretOperations.Create })); // rewrite update ops to create

          const locallyUpdatedSecrets = sourceSecrets
            .filter(
              ({ secretBlindIndex, secretKey, secretValue }) =>
                destinationLocalSecretsGroupedByBlindIndex[secretBlindIndex as string]?.[0] &&
                // if key or value changed
                (destinationLocalSecretsGroupedByBlindIndex[secretBlindIndex as string]?.[0]?.secretKey !== secretKey ||
                  destinationLocalSecretsGroupedByBlindIndex[secretBlindIndex as string]?.[0]?.secretValue !==
                    secretValue)
            )
            .map((el) => ({ ...el, operation: SecretOperations.Update })); // rewrite update ops to create

          const locallyDeletedSecrets = destinationLocalSecrets
            .filter(({ secretBlindIndex }) => !sourceSecretsGroupByBlindIndex[secretBlindIndex as string]?.[0])
            .map((el) => ({ ...el, operation: SecretOperations.Delete }));

          const isEmtpy =
            locallyCreatedSecrets.length + locallyUpdatedSecrets.length + locallyDeletedSecrets.length === 0;
          // eslint-disable-next-line
          if (isEmtpy) continue;

          const policy = await secretApprovalPolicyService.getSecretApprovalPolicy(
            projectId,
            destinationFolder.environmentSlug,
            destinationFolder.path
          );
          // this means it should be a approval request rather than direct replication
          if (policy && actor === ActorType.USER) {
            const localSecretsLatestVersions = destinationLocalSecrets.map(({ id }) => id);
            const latestSecretVersions = await secretVersionDAL.findLatestVersionMany(
              destinationReplicationFolderId,
              localSecretsLatestVersions
            );
            await secretApprovalRequestDAL.transaction(async (tx) => {
              const approvalRequestDoc = await secretApprovalRequestDAL.create(
                {
                  folderId: destinationReplicationFolderId,
                  slug: alphaNumericNanoId(),
                  policyId: policy.id,
                  status: "open",
                  hasMerged: false,
                  committerUserId: actorId,
                  isReplicated: true
                },
                tx
              );
              const commits = locallyCreatedSecrets
                .concat(locallyUpdatedSecrets)
                .concat(locallyDeletedSecrets)
                .map((doc) => {
                  const { operation } = doc;
                  const localSecret = destinationLocalSecretsGroupedByBlindIndex[doc.secretBlindIndex as string]?.[0];

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
              const approvalCommits = await secretApprovalRequestSecretDAL.insertMany(commits, tx);

              return { ...approvalRequestDoc, commits: approvalCommits };
            });
          } else {
            await secretDAL.transaction(async (tx) => {
              if (locallyCreatedSecrets.length) {
                await fnSecretBulkInsert({
                  folderId: destinationReplicationFolderId,
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
                      skipMultilineEncoding: doc.skipMultilineEncoding,
                      references: getAllNestedSecretReferences(doc.secretValue)
                    };
                  })
                });
              }
              if (locallyUpdatedSecrets.length) {
                await fnSecretBulkUpdate({
                  projectId,
                  folderId: destinationReplicationFolderId,
                  secretVersionDAL,
                  secretDAL,
                  tx,
                  secretTagDAL,
                  secretVersionTagDAL,
                  inputSecrets: locallyUpdatedSecrets.map((doc) => {
                    return {
                      filter: {
                        folderId: destinationReplicationFolderId,
                        id: destinationLocalSecretsGroupedByBlindIndex[doc.secretBlindIndex as string][0].id
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
                        skipMultilineEncoding: doc.skipMultilineEncoding,
                        references: getAllNestedSecretReferences(doc.secretValue)
                      }
                    };
                  })
                });
              }
              if (locallyDeletedSecrets.length) {
                await secretDAL.delete(
                  {
                    $in: {
                      id: locallyDeletedSecrets.map(({ id }) => id)
                    },
                    folderId: destinationReplicationFolderId
                  },
                  tx
                );
              }
            });

            await secretQueueService.syncSecrets({
              projectId,
              secretPath: destinationFolder.path,
              environmentSlug: destinationFolder.environmentSlug,
              actorId,
              actor,
              _depth: depth + 1,
              _deDupeReplicationQueue: deDupeReplicationQueue,
              _deDupeQueue: deDupeQueue
            });
          }

          // this is used to avoid multiple times generating secret approval by failed one
          await keyStore.setItemWithExpiry(
            keystoreReplicationSuccessKey(job.id as string, destinationSecretImport.id),
            SECRET_IMPORT_SUCCESS_LOCK,
            1,
            KeyStorePrefixes.SecretReplication
          );

          await secretImportDAL.updateById(destinationSecretImport.id, {
            lastReplicated: new Date(),
            replicationStatus: null,
            isReplicationSuccess: true
          });
        } catch (err) {
          logger.error(
            err,
            `Failed to replicate secret with import id=[${destinationSecretImport.id}] env=[${destinationSecretImport.importEnv.slug}] path=[${destinationSecretImport.importPath}]`
          );
          await secretImportDAL.updateById(destinationSecretImport.id, {
            lastReplicated: new Date(),
            replicationStatus: (err as Error)?.message.slice(0, 500),
            isReplicationSuccess: false
          });
        }
      }
      /*  eslint-enable no-await-in-loop */
    } finally {
      await lock.release();
      logger.info(job.data, "Replication finished");
    }
  });

  queueService.listen(QueueName.SecretReplication, "failed", (job, err) => {
    logger.error(err, "Failed to replicate secret", job?.data);
  });
};
