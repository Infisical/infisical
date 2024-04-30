import { TKeyStoreFactory } from "@app/keystore/keystore";
import { groupBy } from "@app/lib/fn";
import { logger } from "@app/lib/logger";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";

import { TSecretDALFactory } from "../secret/secret-dal";
import { fnSecretBulkInsert, fnSecretBulkUpdate } from "../secret/secret-fns";
import { TSecretVersionDALFactory } from "../secret/secret-version-dal";
import { TSecretVersionTagDALFactory } from "../secret/secret-version-tag-dal";
import { TSecretFolderDALFactory } from "../secret-folder/secret-folder-dal";
import { TSecretImportDALFactory } from "../secret-import/secret-import-dal";
import { TSecretTagDALFactory } from "../secret-tag/secret-tag-dal";
import { TSecretReplicationDALFactory } from "./secret-replication-dal";
import { SecretReplicationOperations, TSyncSecretReplicationDTO } from "./secret-replication-types";

type TSecretReplicationServiceFactoryDep = {
  secretReplicationDAL: TSecretReplicationDALFactory;
  secretDAL: Pick<TSecretDALFactory, "find" | "findByBlindIndexes" | "insertMany" | "bulkUpdate" | "delete">;
  secretImportDAL: Pick<TSecretImportDALFactory, "find">;
  folderDAL: Pick<TSecretFolderDALFactory, "findSecretPathByFolderIds">;
  secretVersionDAL: Pick<TSecretVersionDALFactory, "find" | "insertMany" | "update">;
  secretTagDAL: Pick<TSecretTagDALFactory, "find" | "saveTagsToSecret" | "deleteTagsManySecret">;
  secretVersionTagDAL: Pick<TSecretVersionTagDALFactory, "find" | "insertMany">;
  queueService: Pick<TQueueServiceFactory, "start" | "listen" | "queue" | "stopJobById">;
  keyStore: Pick<TKeyStoreFactory, "acquireLock">;
};

export type TSecretReplicationServiceFactory = ReturnType<typeof secretReplicationServiceFactory>;

// function getRandomError(): number {
//   const minCeiled: number = Math.ceil(0);
//   const maxFloored: number = Math.floor(20);
//   const val = Math.floor(Math.random() * (maxFloored - minCeiled) + minCeiled); // The maximum is exclusive and the minimum is inclusive
//   if (val >= 10) throw new Error("Random error point");
//   return val;
// }

export const secretReplicationServiceFactory = ({
  secretReplicationDAL,
  secretDAL,
  queueService,
  secretVersionDAL,
  secretImportDAL,
  keyStore,
  secretVersionTagDAL,
  secretTagDAL,
  folderDAL
}: TSecretReplicationServiceFactoryDep) => {
  queueService.start(QueueName.SecretReplication, async (job) => {
    logger.info(job.data, "Replication started");
    const { secrets, folderId, secretPath, environmentId, projectId } = job.data;
    const secretImports = await secretImportDAL.find({
      importPath: secretPath,
      importEnv: environmentId,
      isReplication: true
    });
    console.log(">>>> Secret Imports replics ", secretImports.length, secretPath, environmentId);
    if (!secretImports.length) return;

    // unfiltered secrets to be replicated
    console.log(secrets.length);
    const toBeReplicatedSecrets = await secretReplicationDAL.findSecrets({ folderId, secrets });
    const replicatedSecrets = toBeReplicatedSecrets.filter(
      ({ version, latestReplicatedVersion, secretBlindIndex }) =>
        secretBlindIndex && (version === 1 || latestReplicatedVersion <= version)
    );

    const replicatedSecretsGroupBySecretId = groupBy(replicatedSecrets, (i) => i.secretId);
    console.log("replicated ", replicatedSecretsGroupBySecretId);
    const lock = await keyStore.acquireLock(
      replicatedSecrets.map(({ id }) => id),
      5000
    );

    try {
      /*  eslint-disable no-await-in-loop */
      for (const secretImport of secretImports) {
        const importFolderId = secretImport.folderId;

        const localSecrets = await secretDAL.find({
          $in: { secretBlindIndex: replicatedSecrets.map(({ secretBlindIndex }) => secretBlindIndex) },
          folderId: importFolderId,
          isReplicated: true
        });
        const localSecretsGroupedByBlindIndex = groupBy(localSecrets, (i) => i.secretBlindIndex as string);

        const locallyCreatedSecrets = secrets.filter(({ operation, id }) => {
          return (
            (operation === SecretReplicationOperations.Create || operation === SecretReplicationOperations.Update) &&
            !localSecretsGroupedByBlindIndex[replicatedSecretsGroupBySecretId[id][0].secretBlindIndex as string]?.[0]
          );
        });

        const locallyUpdatedSecrets = secrets.filter(
          ({ operation, id }) =>
            (operation === SecretReplicationOperations.Create || operation === SecretReplicationOperations.Update) &&
            localSecretsGroupedByBlindIndex[replicatedSecretsGroupBySecretId[id][0].secretBlindIndex as string]?.[0]
        );

        console.log(replicatedSecretsGroupBySecretId);
        console.log(locallyCreatedSecrets);
        console.log("update", locallyUpdatedSecrets);
        console.log("local board", localSecrets);

        const locallyDeletedSecrets = secrets
          .filter(
            ({ operation, id }) =>
              operation === SecretReplicationOperations.Delete &&
              Boolean(replicatedSecretsGroupBySecretId[id]?.[0]?.secretBlindIndex) &&
              localSecretsGroupedByBlindIndex[replicatedSecretsGroupBySecretId[id][0].secretBlindIndex as string]?.[0]
          )
          .map(
            ({ id }) =>
              localSecretsGroupedByBlindIndex[replicatedSecretsGroupBySecretId[id][0].secretBlindIndex as string][0]
          );

        let nestedImportSecrets: TSyncSecretReplicationDTO["secrets"] = [];
        await secretReplicationDAL.transaction(async (tx) => {
          if (locallyCreatedSecrets.length) {
            const newSecrets = await fnSecretBulkInsert({
              folderId: importFolderId,
              secretVersionDAL,
              secretDAL,
              tx,
              secretTagDAL,
              secretVersionTagDAL,
              inputSecrets: locallyCreatedSecrets.map(({ id }) => {
                const doc = replicatedSecretsGroupBySecretId[id][0];
                return {
                  keyEncoding: doc.keyEncoding,
                  algorithm: doc.algorithm,
                  folderId,
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
                  isReplicated: true,
                  skipMultilineEncoding: doc.skipMultilineEncoding
                };
              })
            });
            nestedImportSecrets = nestedImportSecrets.concat(
              ...newSecrets.map(({ id, version }) => ({ operation: SecretReplicationOperations.Create, version, id }))
            );
          }
          if (locallyUpdatedSecrets.length) {
            const newSecrets = await fnSecretBulkUpdate({
              projectId,
              folderId: importFolderId,
              secretVersionDAL,
              secretDAL,
              tx,
              secretTagDAL,
              secretVersionTagDAL,
              inputSecrets: locallyUpdatedSecrets.map(({ id }) => {
                const doc = replicatedSecretsGroupBySecretId[id][0];
                return {
                  filter: {
                    folderId: importFolderId,
                    id: localSecretsGroupedByBlindIndex[doc.secretBlindIndex as string][0].id
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
                    isReplicated: true,
                    skipMultilineEncoding: doc.skipMultilineEncoding
                  }
                };
              })
            });
            nestedImportSecrets = nestedImportSecrets.concat(
              ...newSecrets.map(({ id, version }) => ({ operation: SecretReplicationOperations.Update, version, id }))
            );
          }
          if (locallyDeletedSecrets.length) {
            const newSecrets = await secretDAL.delete(
              {
                $in: {
                  id: locallyDeletedSecrets.map(({ id }) => id)
                },
                isReplicated: true,
                folderId: importFolderId
              },
              tx
            );
            nestedImportSecrets = nestedImportSecrets.concat(
              ...newSecrets.map(({ id, version }) => ({ operation: SecretReplicationOperations.Delete, version, id }))
            );
          }
        });
        const [folder] = await folderDAL.findSecretPathByFolderIds(projectId, [secretImport.folderId]);
        console.log("Environment ID -> slug", folder.envId, folder.environmentSlug);
        await queueService.queue(QueueName.SecretReplication, QueueJobs.SecretReplication, {
          folderId: folder.id,
          projectId,
          secrets: nestedImportSecrets,
          secretPath: folder.path,
          environmentId: folder.envId
        });
      }
      await secretVersionDAL.update({ $in: { id: replicatedSecrets.map(({ id }) => id) } }, { isReplicated: true });
      /*  eslint-enable no-await-in-loop */
    } finally {
      await lock.release();
    }
  });

  queueService.listen(QueueName.SecretReplication, "failed", async (job, err) => {
    logger.error(err, "Failed to replicate secret", job?.data);
  });

  const replicate = async (data: TSyncSecretReplicationDTO) => {
    await queueService.queue(QueueName.SecretReplication, QueueJobs.SecretReplication, data, {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 1000
      },
      removeOnComplete: true,
      removeOnFail: true
    });
  };

  return {
    replicate
  };
};
