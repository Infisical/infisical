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
import { TBackfillScope } from "./secret-value-tracking-types";

// A chunk is many read batches rather than one, because the per-project data key is resolved once
// per chunk: on an org using external KMS that resolve is a network call, and a chunk per batch
// would pay it five times as often for nothing.
const CHUNK_SIZE = 5000;
const READ_BATCH_SIZE = 1000;

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

// Jobs queued before the org-wide walk shipped carry only a projectId, so a payload with no scope
// is read as project scope and a deploy does not strand them.
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
    let done = false;

    // Seed the cursor for a run that has not started, and step it past anything deleted since the
    // last chunk, before reading a single row.
    const seedProjects = cursor ? [cursor.projectId] : projectIds;
    await Promise.all(seedProjects.map((projectId) => $foldersOf(projectId)));
    if (!cursor) {
      const seeded = advanceCursor({
        cursor: null,
        projectIds,
        folderIdsByProject: foldersByProject,
        lastRow: null,
        folderExhausted: false
      });
      if (seeded.done) done = true;
      else cursor = seeded.cursor;
    }

    while (!done && cursor && readThisChunk < CHUNK_SIZE) {
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
      const next = advanceCursor({
        cursor,
        projectIds,
        folderIdsByProject: foldersByProject,
        lastRow,
        folderExhausted: rows.length < READ_BATCH_SIZE
      });

      if (next.done) {
        // The walk ends inside the project it was working, so that project's own flag is set here
        // rather than from a completedProjectId the `done` branch never carries.
        // eslint-disable-next-line no-await-in-loop
        await $markProjectComplete(cursor.projectId);
        projectsDone += 1;
        done = true;
        break;
      }

      if (next.completedProjectId) {
        // eslint-disable-next-line no-await-in-loop
        await $markProjectComplete(next.completedProjectId);
        projectsDone += 1;
      }
      cursor = next.cursor;
    }

    if (done) {
      if (scope.scope === "org") await orgDAL.updateById(scope.orgId, { orgWideSecretValueTrackingEnabled: true });
      await state.clear(scopeId);
      logger.info(
        `SecretValueTrackingBackfill: complete [scopeId=${scopeId}] [projectsDone=${projectsDone}] [secretsProcessed=${secretsProcessed}]`
      );
      return;
    }

    await state.write(scopeId, {
      status: "running",
      cursor,
      projectsTotal: runState.projectsTotal,
      projectsDone,
      secretsProcessed,
      lastProgressAt: new Date().toISOString()
    });
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
