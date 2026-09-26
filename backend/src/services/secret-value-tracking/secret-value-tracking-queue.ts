import { ProjectType } from "@app/db/schemas";
import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";
import { logger } from "@app/lib/logger";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";
import { JobState } from "@app/queue/queue-service";

import { TKmsServiceFactory } from "../kms/kms-service";
import { KmsDataKey } from "../kms/kms-types";
import { TOrgDALFactory } from "../org/org-dal";
import { TProjectDALFactory } from "../project/project-dal";
import { TSecretFolderDALFactory } from "../secret-folder/secret-folder-dal";
import { createOrgSecretBlindIndexer } from "../secret-v2-bridge/secret-blind-index-fns";
import { TSecretV2BridgeDALFactory } from "../secret-v2-bridge/secret-v2-bridge-dal";
import { advanceCursor, needsBackfill } from "./secret-value-tracking-fns";
import { TBackfillCursor, TBackfillScope } from "./secret-value-tracking-types";

const READ_BATCH_SIZE = 1000;
// Decrypting a batch and hashing it twice is CPU work on a single-threaded runtime, so the walk
// yields between batches. Without it a large scope holds the event loop for as long as it runs and
// every other request waits behind it.
const PAUSE_BETWEEN_BATCHES_MS = 100;

const NO_PROGRESS = { projectsTotal: 0, projectsDone: 0, secretsProcessed: 0 };

export type TBackfillState = {
  status: JobState;
  message?: string;
  projectsTotal: number;
  projectsDone: number;
  secretsProcessed: number;
};

type TSecretValueTrackingQueueFactoryDep = {
  queueService: TQueueServiceFactory;
  keyStore: Pick<TKeyStoreFactory, "deleteItems">;
  projectDAL: Pick<TProjectDALFactory, "find" | "findById" | "updateById">;
  orgDAL: Pick<TOrgDALFactory, "updateById">;
  folderDAL: Pick<TSecretFolderDALFactory, "findByProjectId">;
  secretV2BridgeDAL: Pick<TSecretV2BridgeDALFactory, "findSecretsInFolderAfter" | "batchSetBlindIndexes">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
};

// A payload with no scope predates the org-wide walk. Reading it as project scope is what lets a job
// queued seconds before a deploy still do the thing it was queued to do.
const resolveScope = (data: { scope?: "org" | "project"; orgId?: string; projectId?: string }): TBackfillScope => {
  if (data.scope === "org" && data.orgId) return { scope: "org", orgId: data.orgId };
  return { scope: "project", projectId: data.projectId as string };
};

const scopeIdOf = (scope: TBackfillScope) => (scope.scope === "org" ? scope.orgId : scope.projectId);

// One job id per scope. BullMQ will not add a second job under an id it already holds, and that is
// what stops two backfills running over the same scope.
const jobIdOf = (scope: TBackfillScope) => `secret-value-tracking-${scopeIdOf(scope)}`;

export const secretValueTrackingQueueFactory = ({
  queueService,
  keyStore,
  projectDAL,
  orgDAL,
  folderDAL,
  secretV2BridgeDAL,
  kmsService
}: TSecretValueTrackingQueueFactoryDep) => {
  const startBackfill = async (scope: TBackfillScope) => {
    const jobId = jobIdOf(scope);

    const existing = await queueService.getJob(QueueName.SecretBlindIndexMigration, jobId);
    if (existing) {
      const state = await existing.getState();
      // A finished record is kept only so a status poll can still see it. It is not a run, so it
      // must not stand in the way of starting one.
      if (state === JobState.Completed || state === JobState.Failed) await existing.remove();
      else return;
    }

    await queueService.queue(QueueName.SecretBlindIndexMigration, QueueJobs.SecretBlindIndexMigration, scope, {
      // Brief, because completion itself is the durable flag; this only has to outlive a poll.
      removeOnComplete: { age: 60 },
      // A day, so someone who comes back the next morning can still read why it failed.
      removeOnFail: { age: 24 * 3600 },
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      jobId
    });
  };

  const getBackfillState = async (scope: TBackfillScope): Promise<TBackfillState> => {
    const job = await queueService.getJob(QueueName.SecretBlindIndexMigration, jobIdOf(scope));
    if (!job) return { status: JobState.NotFound, ...NO_PROGRESS };

    // The job reports its own progress as it walks, so there is nowhere else to keep it.
    const reported = (job.progress ?? {}) as Partial<typeof NO_PROGRESS>;
    const progress = { ...NO_PROGRESS, ...reported };

    const state = await job.getState();
    if (state === JobState.Failed) {
      return { status: JobState.Failed, message: job.failedReason ?? "Unknown error", ...progress };
    }
    if (state === JobState.Completed) return { status: JobState.Completed, ...progress };
    return { status: JobState.Pending, ...progress };
  };

  queueService.start(
    QueueName.SecretBlindIndexMigration,
    async (job) => {
      const scope = resolveScope(job.data);
      const scopeId = scopeIdOf(scope);

      const projects =
        scope.scope === "project"
          ? [await projectDAL.findById(scope.projectId)].filter(Boolean)
          : await projectDAL.find({ orgId: scope.orgId, type: ProjectType.SecretManager });

      if (!projects.length) {
        // Nothing to index is still a finished org: every secret it writes from here carries both digests.
        if (scope.scope === "org") await orgDAL.updateById(scope.orgId, { orgWideSecretValueTrackingEnabled: true });
        logger.info(`SecretValueTrackingBackfill: nothing to walk [scopeId=${scopeId}]`);
        return;
      }

      const { orgId } = projects[0];
      const projectIds = projects.map((project) => project.id).sort();

      // Every project's folders up front. The walk is one pass over the whole scope, so deferring
      // them buys nothing, and a complete map is what lets advanceCursor tell a project that has no
      // folders from one it has simply not been shown.
      const foldersByProject: Record<string, string[]> = {};
      for await (const projectId of projectIds) {
        // Soft-deleted environments are included: the delete is reversible, so leaving their rows
        // unindexed and then flagging the scope complete breaks the moment one is restored.
        const folders = await folderDAL.findByProjectId(projectId, undefined, true);
        foldersByProject[projectId] = folders.map((folder) => folder.id).sort();
      }

      // One org data key for the whole walk, since every project in the org shares it.
      const { generateOrgLevelBlindIndex } = await createOrgSecretBlindIndexer({ orgId, kmsService });
      const projectCiphers = new Map<
        string,
        {
          decryptor: (input: { cipherTextBlob: Buffer }) => Buffer;
          generateBlindIndex: (value: Buffer) => Promise<string>;
        }
      >();

      const $cipherOf = async (projectId: string) => {
        const cached = projectCiphers.get(projectId);
        if (cached) return cached;

        const { decryptor, generateSecretBlindIndex } = await kmsService.createCipherPairWithDataKey({
          type: KmsDataKey.SecretManager,
          projectId
        });
        const pair = { decryptor, generateBlindIndex: generateSecretBlindIndex };
        projectCiphers.set(projectId, pair);
        return pair;
      };

      const markedProjectIds = new Set<string>();
      const $markProjectComplete = async (projectId: string) => {
        markedProjectIds.add(projectId);
        await projectDAL.updateById(projectId, { secretBlindIndexEnabled: true });
        await keyStore.deleteItems({ pattern: `${KeyStorePrefixes.InsightsCache(projectId, "secrets-duplication")}*` });
      };

      const $advance = (
        from: TBackfillCursor | null,
        lastRow: { key: string; id: string } | null,
        folderExhausted: boolean
      ) => advanceCursor({ cursor: from, projectIds, folderIdsByProject: foldersByProject, lastRow, folderExhausted });

      let secretsProcessed = 0;
      let projectsDone = 0;

      const seeded = $advance(null, null, false);
      let cursor = seeded.done ? null : seeded.cursor;

      while (cursor) {
        // eslint-disable-next-line no-await-in-loop
        const rows = await secretV2BridgeDAL.findSecretsInFolderAfter(
          cursor.folderId,
          { key: cursor.key, id: cursor.id },
          READ_BATCH_SIZE
        );

        const pending = rows.filter(needsBackfill);
        if (pending.length) {
          // eslint-disable-next-line no-await-in-loop
          const { decryptor, generateBlindIndex } = await $cipherOf(cursor.projectId);
          // eslint-disable-next-line no-await-in-loop
          const updates = await Promise.all(
            pending.map(async (row) => {
              const value = decryptor({ cipherTextBlob: row.encryptedValue as Buffer });
              const [secretValueBlindIndex, secretValueOrgBlindIndex] = await Promise.all([
                generateBlindIndex(value),
                generateOrgLevelBlindIndex(value)
              ]);
              return { id: row.id, secretValueBlindIndex, secretValueOrgBlindIndex };
            })
          );
          // eslint-disable-next-line no-await-in-loop
          await secretV2BridgeDAL.batchSetBlindIndexes(updates);
          secretsProcessed += updates.length;
        }

        const lastRow = rows.length ? { key: rows[rows.length - 1].key, id: rows[rows.length - 1].id } : null;
        const next = $advance(cursor, lastRow, rows.length < READ_BATCH_SIZE);

        if (next.done) {
          // The walk ends inside the project it was working, so that project's own flag is set here
          // rather than from a completedProjectId the `done` branch never carries.
          // eslint-disable-next-line no-await-in-loop
          await $markProjectComplete(cursor.projectId);
          projectsDone += 1;
          cursor = null;
          break;
        }

        if (next.completedProjectId) {
          // eslint-disable-next-line no-await-in-loop
          await $markProjectComplete(next.completedProjectId);
          projectsDone += 1;
        }
        cursor = next.cursor;

        // Doubles as the heartbeat BullMQ reads to tell a working job from a stalled one.
        // eslint-disable-next-line no-await-in-loop
        await job.updateProgress({ projectsTotal: projectIds.length, projectsDone, secretsProcessed });
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => {
          setTimeout(resolve, PAUSE_BETWEEN_BATCHES_MS);
        });
      }

      // The cursor steps over projects with no folders, so they are never finished inside the walk.
      // They hold nothing to index, and every secret written to them later carries both digests.
      for await (const projectId of projectIds) {
        if (!markedProjectIds.has(projectId)) {
          await $markProjectComplete(projectId);
          projectsDone += 1;
        }
      }

      if (scope.scope === "org") await orgDAL.updateById(scope.orgId, { orgWideSecretValueTrackingEnabled: true });

      await job.updateProgress({ projectsTotal: projectIds.length, projectsDone, secretsProcessed });
      logger.info(
        `SecretValueTrackingBackfill: complete [scopeId=${scopeId}] [projectsDone=${projectsDone}] [secretsProcessed=${secretsProcessed}]`
      );
    },
    // One walk at a time, so a second scope waits rather than competing for the same connection pool
    // and the same CPU.
    { concurrency: 1 }
  );

  queueService.listen(QueueName.SecretBlindIndexMigration, "failed", (job, err) => {
    const scopeId = job?.data ? scopeIdOf(resolveScope(job.data)) : "unknown";
    logger.error(err, `SecretValueTrackingBackfill: failed [scopeId=${scopeId}]`);
  });

  return { startBackfill, getBackfillState };
};

export type TSecretValueTrackingQueueFactory = ReturnType<typeof secretValueTrackingQueueFactory>;
