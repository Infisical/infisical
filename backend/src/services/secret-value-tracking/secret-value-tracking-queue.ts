import { ProjectType } from "@app/db/schemas";
import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";
import { logger } from "@app/lib/logger";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";

import { TKmsServiceFactory } from "../kms/kms-service";
import { KmsDataKey } from "../kms/kms-types";
import { TOrgDALFactory } from "../org/org-dal";
import { TProjectDALFactory } from "../project/project-dal";
import { TSecretFolderDALFactory } from "../secret-folder/secret-folder-dal";
import { createOrgSecretBlindIndexer } from "../secret-v2-bridge/secret-blind-index-fns";
import { TSecretV2BridgeDALFactory } from "../secret-v2-bridge/secret-v2-bridge-dal";
import { advanceCursor, needsBackfill } from "./secret-value-tracking-fns";
import { secretValueTrackingStateFactory } from "./secret-value-tracking-state";
import { TBackfillCursor, TBackfillScope } from "./secret-value-tracking-types";

// A chunk is many read batches rather than one, because the per-project data key is resolved once
// per chunk: on an org using external KMS that resolve is a network call, and a chunk per batch
// would pay it five times as often for nothing.
const CHUNK_SIZE = 5000;
const READ_BATCH_SIZE = 1000;
// A folder that holds nothing still costs a query, so a chunk is bounded on steps as well as rows.
// Without it a project of tens of thousands of empty folders runs unbounded inside one job.
const MAX_STEPS_PER_CHUNK = 500;
// Refreshes lastProgressAt inside a long chunk. Left to the end of the chunk, a slow one reads as
// stalled and the enable guard lets a second chain take the same scope while this one is still
// walking it.
const HEARTBEAT_EVERY_STEPS = 50;

type TSecretValueTrackingQueueFactoryDep = {
  queueService: TQueueServiceFactory;
  keyStore: Pick<
    TKeyStoreFactory,
    "getItemPrimary" | "setItemWithExpiry" | "setItemWithExpiryNX" | "deleteItem" | "deleteItems"
  >;
  projectDAL: Pick<TProjectDALFactory, "find" | "findById" | "updateById">;
  orgDAL: Pick<TOrgDALFactory, "updateById">;
  folderDAL: Pick<TSecretFolderDALFactory, "findByProjectId">;
  secretV2BridgeDAL: Pick<TSecretV2BridgeDALFactory, "findSecretsInFolderAfter" | "batchSetBlindIndexes">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
};

// A payload with no scope is one queued before the org-wide walk shipped. It is read as project
// scope so the shape is understood, but such a job has no run state and the handler stops on that:
// the old code kept no state, so there is no cursor to resume and nothing to safely assume. The
// enable button simply comes back for the customer to press again.
const resolveScope = (data: { scope?: "org" | "project"; orgId?: string; projectId?: string }): TBackfillScope => {
  if (data.scope === "org" && data.orgId) return { scope: "org", orgId: data.orgId };
  return { scope: "project", projectId: data.projectId as string };
};

const scopeIdOf = (scope: TBackfillScope) => (scope.scope === "org" ? scope.orgId : scope.projectId);

export const secretValueTrackingQueueFactory = ({
  queueService,
  keyStore,
  projectDAL,
  orgDAL,
  folderDAL,
  secretV2BridgeDAL,
  kmsService
}: TSecretValueTrackingQueueFactoryDep) => {
  const state = secretValueTrackingStateFactory({ keyStore });

  // Each chunk needs its own id: BullMQ ignores an add for an id that is currently active, so a
  // fixed id would break the chain at the second chunk.
  const queueChunk = async (scope: TBackfillScope) =>
    queueService.queue(QueueName.SecretBlindIndexMigration, QueueJobs.SecretBlindIndexMigration, scope, {
      removeOnComplete: { age: 60 },
      removeOnFail: { age: 24 * 3600 },
      // Without retries one transient database or KMS blip ends the chain and the customer has to
      // start the backfill again by hand.
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      jobId: `secret-value-tracking-${scopeIdOf(scope)}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    });

  const $resolveProjectIds = async (scope: TBackfillScope) => {
    if (scope.scope === "project") {
      const project = await projectDAL.findById(scope.projectId);
      return { orgId: project?.orgId ?? null, projectIds: project ? [project.id] : [] };
    }

    const projects = await projectDAL.find({ orgId: scope.orgId, type: ProjectType.SecretManager });
    return {
      orgId: scope.orgId,
      projectIds: projects.map((project) => project.id).sort()
    };
  };

  const $markProjectComplete = async (projectId: string) => {
    await projectDAL.updateById(projectId, { secretBlindIndexEnabled: true });
    await keyStore.deleteItems({ pattern: `${KeyStorePrefixes.InsightsCache(projectId, "secrets-duplication")}*` });
  };

  const handler = async (job: { data: { scope?: "org" | "project"; orgId?: string; projectId?: string } }) => {
    const scope = resolveScope(job.data);
    const scopeId = scopeIdOf(scope);

    const runState = await state.read(scopeId);
    if (!runState) {
      logger.info(`SecretValueTrackingBackfill: no run state, nothing to resume [scopeId=${scopeId}]`);
      return;
    }

    const { orgId, projectIds } = await $resolveProjectIds(scope);
    if (!orgId) {
      logger.info(`SecretValueTrackingBackfill: scope no longer exists [scopeId=${scopeId}]`);
      await state.clear(scopeId);
      return;
    }

    // One org data key for the whole chunk, since every project in the org shares it.
    const { generateOrgLevelBlindIndex } = await createOrgSecretBlindIndexer({ orgId, kmsService });
    const projectCiphers = new Map<
      string,
      {
        decryptor: (input: { cipherTextBlob: Buffer }) => Buffer;
        generateBlindIndex: (value: Buffer) => Promise<string>;
      }
    >();
    const foldersByProject: Record<string, string[]> = {};

    const $foldersOf = async (projectId: string) => {
      if (!foldersByProject[projectId]) {
        const folders = await folderDAL.findByProjectId(projectId);
        foldersByProject[projectId] = folders.map((folder) => folder.id).sort();
      }
      return foldersByProject[projectId];
    };

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

    let { cursor } = runState;
    let { projectsDone } = runState;
    let { secretsProcessed } = runState;
    let readThisChunk = 0;
    let steps = 0;
    let done = false;

    const $writeProgress = async (at: TBackfillCursor | null) => {
      await state.write(scopeId, {
        status: "running",
        cursor: at,
        projectsTotal: runState.projectsTotal,
        projectsDone,
        secretsProcessed,
        lastProgressAt: new Date().toISOString()
      });
    };

    // advanceCursor only sees the projects whose folders are loaded, and reads an unloaded one as a
    // project with none, so it would declare the walk finished at the first project boundary. Load
    // the next unseeded project and ask again before accepting the end.
    const $advance = async (
      from: TBackfillCursor | null,
      lastRow: { key: string; id: string } | null,
      folderExhausted: boolean
    ) => {
      for (;;) {
        const next = advanceCursor({
          cursor: from,
          projectIds,
          folderIdsByProject: foldersByProject,
          lastRow,
          folderExhausted
        });
        if (!next.done) return next;

        const unseeded = projectIds.find((projectId) => !(projectId in foldersByProject));
        if (!unseeded) return next;
        // eslint-disable-next-line no-await-in-loop
        await $foldersOf(unseeded);
      }
    };

    if (!cursor) {
      const seeded = await $advance(null, null, false);
      if (seeded.done) done = true;
      else cursor = seeded.cursor;
    }

    while (!done && cursor && readThisChunk < CHUNK_SIZE && steps < MAX_STEPS_PER_CHUNK) {
      steps += 1;
      // eslint-disable-next-line no-await-in-loop
      await $foldersOf(cursor.projectId);

      // eslint-disable-next-line no-await-in-loop
      const rows = await secretV2BridgeDAL.findSecretsInFolderAfter(
        cursor.folderId,
        { key: cursor.key, id: cursor.id },
        READ_BATCH_SIZE
      );
      readThisChunk += rows.length;

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
      // eslint-disable-next-line no-await-in-loop
      const next = await $advance(cursor, lastRow, rows.length < READ_BATCH_SIZE);

      if (next.done) {
        // The walk ends inside the project it was working, so that project's own flag is set here
        // rather than from a completedProjectId the `done` branch never carries. A cursor left on a
        // project that has since been deleted is not a project to flag.
        if (projectIds.includes(cursor.projectId)) {
          // eslint-disable-next-line no-await-in-loop
          await $markProjectComplete(cursor.projectId);
          projectsDone += 1;
        }
        done = true;
        break;
      }

      if (next.completedProjectId) {
        // eslint-disable-next-line no-await-in-loop
        await $markProjectComplete(next.completedProjectId);
        projectsDone += 1;
      }
      cursor = next.cursor;

      if (steps % HEARTBEAT_EVERY_STEPS === 0) {
        // eslint-disable-next-line no-await-in-loop
        await $writeProgress(cursor);
      }
    }

    if (done) {
      if (scope.scope === "org") await orgDAL.updateById(scope.orgId, { orgWideSecretValueTrackingEnabled: true });
      await state.clear(scopeId);
      logger.info(
        `SecretValueTrackingBackfill: complete [scopeId=${scopeId}] [projectsDone=${projectsDone}] [secretsProcessed=${secretsProcessed}]`
      );
      return;
    }

    await $writeProgress(cursor);
    await queueChunk(scope);
  };

  queueService.start(QueueName.SecretBlindIndexMigration, handler, {
    concurrency: 1,
    limiter: { max: 1, duration: 1000 }
  });

  queueService.listen(QueueName.SecretBlindIndexMigration, "failed", (job, err) => {
    const scopeId = job?.data ? scopeIdOf(resolveScope(job.data)) : undefined;
    logger.error(err, `SecretValueTrackingBackfill: failed [scopeId=${scopeId}]`);
    if (!scopeId) return;

    // Recording the failure is what lets the status endpoint answer immediately, rather than making
    // the user wait out the staleness window.
    void state
      .read(scopeId)
      .then((existing) =>
        existing ? state.write(scopeId, { ...existing, status: "failed", error: err.message }) : undefined
      )
      .catch((writeErr) =>
        logger.error(writeErr, `SecretValueTrackingBackfill: could not record failure [scopeId=${scopeId}]`)
      );
  });

  const startBackfill = async (scope: TBackfillScope) => {
    await queueChunk(scope);
  };

  return { startBackfill };
};

export type TSecretValueTrackingQueueFactory = ReturnType<typeof secretValueTrackingQueueFactory>;
