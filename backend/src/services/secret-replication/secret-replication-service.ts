import { TSecretApprovalPolicyServiceFactory } from "@app/ee/services/secret-approval-policy/secret-approval-policy-service";
import { TSecretApprovalRequestDALFactory } from "@app/ee/services/secret-approval-request/secret-approval-request-dal";
import { TSecretApprovalRequestSecretDALFactory } from "@app/ee/services/secret-approval-request/secret-approval-request-secret-dal";
import { TKeyStoreFactory } from "@app/keystore/keystore";
import { groupBy } from "@app/lib/fn";
import { logger } from "@app/lib/logger";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";

import { TSecretDALFactory } from "../secret/secret-dal";
import { fnSecretBulkInsert, fnSecretBulkUpdate } from "../secret/secret-fns";
import { SecretOperations, TSyncSecretsDTO } from "../secret/secret-types";
import { TSecretVersionDALFactory } from "../secret/secret-version-dal";
import { TSecretVersionTagDALFactory } from "../secret/secret-version-tag-dal";
import { TSecretBlindIndexDALFactory } from "../secret-blind-index/secret-blind-index-dal";
import { TSecretFolderDALFactory } from "../secret-folder/secret-folder-dal";
import { TSecretImportDALFactory } from "../secret-import/secret-import-dal";
import { TSecretTagDALFactory } from "../secret-tag/secret-tag-dal";
import { TSecretReplicationDALFactory } from "./secret-replication-dal";

type TSecretReplicationServiceFactoryDep = {
  secretReplicationDAL: TSecretReplicationDALFactory;
  secretDAL: Pick<TSecretDALFactory, "find" | "findByBlindIndexes" | "insertMany" | "bulkUpdate" | "delete">;
  secretVersionDAL: Pick<TSecretVersionDALFactory, "find" | "insertMany" | "update" | "findLatestVersionMany">;
  secretImportDAL: Pick<TSecretImportDALFactory, "find">;
  folderDAL: Pick<TSecretFolderDALFactory, "findSecretPathByFolderIds" | "findBySecretPath">;
  secretVersionTagDAL: Pick<TSecretVersionTagDALFactory, "find" | "insertMany">;
  queueService: Pick<TQueueServiceFactory, "start" | "listen" | "queue" | "stopJobById">;
  secretApprovalPolicyService: Pick<TSecretApprovalPolicyServiceFactory, "getSecretApprovalPolicy">;
  keyStore: Pick<TKeyStoreFactory, "acquireLock">;
  secretBlindIndexDAL: Pick<TSecretBlindIndexDALFactory, "findOne">;
  secretTagDAL: Pick<TSecretTagDALFactory, "findManyTagsById" | "saveTagsToSecret" | "deleteTagsManySecret" | "find">;
  secretApprovalRequestDAL: Pick<TSecretApprovalRequestDALFactory, "create" | "transaction">;
  secretApprovalRequestSecretDAL: Pick<
    TSecretApprovalRequestSecretDALFactory,
    "insertMany" | "insertApprovalSecretTags"
  >;
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
  folderDAL,
  secretApprovalPolicyService,
  secretApprovalRequestSecretDAL,
  secretApprovalRequestDAL
}: TSecretReplicationServiceFactoryDep) => {
  queueService.start(QueueName.SecretReplication, async (job) => {
    logger.info(job.data, "Replication started");
    const { secrets, folderId, secretPath, environmentId, projectId, membershipId } = job.data;
    const secretImports = await secretImportDAL.find({
      importPath: secretPath,
      importEnv: environmentId,
      isReplication: true
    });
    console.log(">>>> Secret Imports replics ", secretImports.length, secretPath, environmentId);
    if (!secretImports.length || !secrets.length) return;

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
        const [importedFolder] = await folderDAL.findSecretPathByFolderIds(projectId, [secretImport.folderId]);
        const importFolderId = importedFolder.id;

        const localSecrets = await secretDAL.find({
          $in: { secretBlindIndex: replicatedSecrets.map(({ secretBlindIndex }) => secretBlindIndex) },
          folderId: importFolderId,
          isReplicated: true
        });
        const localSecretsGroupedByBlindIndex = groupBy(localSecrets, (i) => i.secretBlindIndex as string);

        const locallyCreatedSecrets = secrets.filter(({ operation, id }) => {
          return (
            (operation === SecretOperations.Create || operation === SecretOperations.Update) &&
            !localSecretsGroupedByBlindIndex[replicatedSecretsGroupBySecretId[id][0].secretBlindIndex as string]?.[0]
          );
        });

        const locallyUpdatedSecrets = secrets.filter(
          ({ operation, id }) =>
            (operation === SecretOperations.Create || operation === SecretOperations.Update) &&
            localSecretsGroupedByBlindIndex[replicatedSecretsGroupBySecretId[id][0].secretBlindIndex as string]?.[0]
        );

        console.log(replicatedSecretsGroupBySecretId);
        console.log(locallyCreatedSecrets);
        console.log("update", locallyUpdatedSecrets);
        console.log("local board", localSecrets);

        const locallyDeletedSecrets = secrets.filter(
          ({ operation, id }) =>
            operation === SecretOperations.Delete &&
            Boolean(replicatedSecretsGroupBySecretId[id]?.[0]?.secretBlindIndex) &&
            localSecretsGroupedByBlindIndex[replicatedSecretsGroupBySecretId[id][0].secretBlindIndex as string]?.[0]
        );

        const policy = await secretApprovalPolicyService.getSecretApprovalPolicy(
          projectId,
          importedFolder.environmentSlug,
          importedFolder.path
        );
        // this means it should be a approval request rather than direct replication
        if (policy) {
          const localSecretsLatestVersions = localSecrets.map(({ id }) => id);
          const latestSecretVersions = await secretVersionDAL.findLatestVersionMany(
            importFolderId,
            localSecretsLatestVersions
          );
          await secretApprovalRequestDAL.transaction(async (tx) => {
            const approvalRequestDoc = await secretApprovalRequestDAL.create(
              {
                folderId: importFolderId,
                slug: alphaNumericNanoId(),
                policyId: policy.id,
                status: "open",
                hasMerged: false,
                committerId: membershipId
              },
              tx
            );
            const commits = locallyCreatedSecrets
              .concat(locallyUpdatedSecrets)
              .concat(locallyDeletedSecrets)
              .map(({ id, operation }) => {
                const doc = replicatedSecretsGroupBySecretId[id][0];
                const localSecret = localSecretsGroupedByBlindIndex[doc.secretBlindIndex as string]?.[0];
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
                  isReplicated: true,
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
          let nestedImportSecrets: TSyncSecretsDTO["secrets"] = [];
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
                newSecrets.map(({ id, version }) => ({ operation: SecretOperations.Create, version, id }))
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
                newSecrets.map(({ id, version }) => ({ operation: SecretOperations.Update, version, id }))
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
                newSecrets.map(({ id, version }) => ({ operation: SecretOperations.Delete, version, id }))
              );
            }
          });
          console.log("Environment ID -> slug", importedFolder.envId, importedFolder.environmentSlug);
          await queueService.queue(QueueName.SecretReplication, QueueJobs.SecretReplication, {
            folderId: importedFolder.id,
            projectId,
            secrets: nestedImportSecrets,
            secretPath: importedFolder.path,
            environmentId: importedFolder.envId,
            membershipId
          });
        }
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
};
