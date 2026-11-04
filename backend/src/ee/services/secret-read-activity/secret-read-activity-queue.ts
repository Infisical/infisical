import { SecretType, TableName } from "@app/db/schemas";
import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";
import { getConfig } from "@app/lib/config/env";
import { CronJobName, TCronJobFactory } from "@app/lib/cron/cron-job";
import { generateCacheKeyFromData } from "@app/lib/crypto/cache";
import { chunkArray, groupBy } from "@app/lib/fn";
import { logger } from "@app/lib/logger";
import { ActorType } from "@app/services/auth/auth-type";
import { TProjectEnvDALFactory } from "@app/services/project-env/project-env-dal";
import { TSecretFolderDALFactory } from "@app/services/secret-folder/secret-folder-dal";
import { ReservedFolders } from "@app/services/secret-folder/secret-folder-types";
import { TSecretImportDALFactory } from "@app/services/secret-import/secret-import-dal";
import { TSecretV2BridgeDALFactory } from "@app/services/secret-v2-bridge/secret-v2-bridge-dal";

import { TSecretReadActivityDALFactory } from "./secret-read-activity-dal";
import {
  getReadActivityWindowStart,
  getUtcMonthStart,
  loadProjectFolderTree,
  normalizeSecretPath,
  toLocationKey
} from "./secret-read-activity-fns";
import {
  SecretReadObjectType,
  TProjectFolderTree,
  TRecordBulkSecretReadDTO,
  TRecordSecretReadDTO,
  TSecretLastRead,
  TSecretReaderType,
  TSecretReadStreamEntry
} from "./secret-read-activity-types";

// Matches the migration, which creates the first partitions.
const SECRET_READ_PARTITION_MONTHS_AHEAD = 3;
const SECRET_READ_GATE_TTL_SECONDS = 25 * 60 * 60;
// The stream normally holds about a minute of first-of-the-day reads. The cap is headroom for a stalled flush:
// Redis drops the oldest unflushed reads only after this many have piled up.
const SECRET_READ_STREAM_MAX_LENGTH = 300_000;
const SECRET_READ_FLUSH_BATCH_SIZE = 1000;
const SECRET_READ_FLUSH_MAX_ENTRIES = 50_000;
// The flush is cut off before its lock can expire, so a slow run never overlaps the next one.
const SECRET_READ_FLUSH_TIMEOUT_MS = 4 * 60 * 1000;
const SECRET_READ_CONSUMER_LOCK_TTL_MS = 5 * 60 * 1000;
// The cap counts entries, not bytes, so this bounds an entry at about 3.7 KB and a full stream at about 1.1 GB.
const SECRET_READ_STREAM_ENTRY_MAX_SECRETS = 100;

type TSecretReadActivityQueueServiceFactoryDep = {
  secretReadActivityDAL: Pick<
    TSecretReadActivityDALFactory,
    "upsertLastReads" | "createMonthlyPartitions" | "dropPartitionsEndingBefore"
  >;
  folderDAL: Pick<TSecretFolderDALFactory, "findByProjectId">;
  projectEnvDAL: Pick<TProjectEnvDALFactory, "find">;
  secretImportDAL: Pick<TSecretImportDALFactory, "findByIds">;
  secretV2BridgeDAL: Pick<TSecretV2BridgeDALFactory, "find">;
  keyStore: Pick<
    TKeyStoreFactory,
    "setItemWithExpiryNX" | "deleteItem" | "streamAdd" | "streamCollect" | "streamTrim" | "acquireLock"
  >;
  cronJob: TCronJobFactory;
};

export type TSecretReadActivityQueueServiceFactory = ReturnType<typeof secretReadActivityQueueServiceFactory>;

export const secretReadActivityQueueServiceFactory = ({
  secretReadActivityDAL,
  folderDAL,
  projectEnvDAL,
  secretImportDAL,
  secretV2BridgeDAL,
  keyStore,
  cronJob
}: TSecretReadActivityQueueServiceFactoryDep) => {
  const $isTrackedReader = (actor: ActorType): actor is TSecretReaderType =>
    actor === ActorType.USER || actor === ActorType.IDENTITY;

  // Only the first matching read per reader per day reaches the stream, so a client polling every minute costs
  // one Redis call per read.
  const $record = async (
    { actor, actorId, projectId }: { actor: TSecretReaderType; actorId: string; projectId: string },
    scope: string,
    reads: Pick<
      TSecretReadStreamEntry,
      "environment" | "secretPath" | "recursive" | "secretIds" | "referencesExpanded"
    >[]
  ) => {
    const readAt = new Date();
    const gateKey = KeyStorePrefixes.SecretReadActivityGate(readAt.toISOString().slice(0, 10), actorId, scope);

    try {
      if (!(await keyStore.setItemWithExpiryNX(gateKey, SECRET_READ_GATE_TTL_SECONDS, 1))) return;
      for (const read of reads) {
        const entry: TSecretReadStreamEntry = {
          actorType: actor,
          actorId,
          projectId,
          readAt: readAt.toISOString(),
          ...read
        };
        // eslint-disable-next-line no-await-in-loop
        await keyStore.streamAdd(
          KeyStorePrefixes.SecretReadActivityStream,
          "*",
          { data: JSON.stringify(entry) },
          SECRET_READ_STREAM_MAX_LENGTH
        );
      }
    } catch (error) {
      // Left in place, the gate would hide the rest of today's reads of this scope.
      await keyStore.deleteItem(gateKey).catch(() => undefined);
      throw error;
    }
  };

  // Routes call this without awaiting it once a read's response is built, so it never throws: losing a read is
  // better than failing or slowing the read that produced it.
  const recordRead = async ({ actor, actorId, projectId, secretIds, referencesExpanded }: TRecordSecretReadDTO) => {
    if (!$isTrackedReader(actor) || !secretIds.length) return;

    try {
      const uniqueSecretIds = [...new Set(secretIds)].sort();
      await $record(
        { actor, actorId, projectId },
        `secrets:${String(referencesExpanded)}:${generateCacheKeyFromData(uniqueSecretIds)}`,
        chunkArray(uniqueSecretIds, SECRET_READ_STREAM_ENTRY_MAX_SECRETS).map((chunk) => ({
          secretIds: chunk,
          referencesExpanded
        }))
      );
    } catch (error) {
      logger.warn(error, `Failed to record secret read [projectId=${projectId}] [actorId=${actorId}]`);
    }
  };

  // A read that returned whole folders (no filters, imports and references included) is recorded against
  // them. A narrower one is recorded against the secrets it returned, so the secrets it left out are not
  // credited. Like recordRead, it never throws.
  const recordBulkRead = async ({
    actor,
    actorId,
    projectId,
    environment,
    secretPath,
    recursive,
    isFiltered,
    includeImports,
    expandSecretReferences,
    includesPersonalOverrides,
    notModified,
    etag,
    secrets,
    imports = [],
    referencedSecretIds
  }: TRecordBulkSecretReadDTO) => {
    if (!$isTrackedReader(actor)) return;

    try {
      // A personal override replaces the shared value, so a read that returns overrides only covers what it returned.
      if (!isFiltered && includeImports && expandSecretReferences && !includesPersonalOverrides) {
        const normalizedPath = normalizeSecretPath(secretPath);
        // Keyed on the response's ETag too, so a read that returns more (after the reader got access to another
        // secret) is recorded again the same day instead of being gated as a repeat.
        await $record(
          { actor, actorId, projectId },
          `folder:${projectId}:${environment}:${normalizedPath}:${String(recursive)}:${etag ?? ""}`,
          [{ environment, secretPath: normalizedPath, recursive }]
        );
        // A folder read credits only what its shared secrets hand over, since most folder reads leave personal values
        // out. One that returned personal secrets (the v3 list does) records them too, for what their references hold.
        const personalSecretIds = [...secrets, ...imports.flatMap((secretImport) => secretImport.secrets)]
          .filter((secret) => secret.type === SecretType.Personal && !secret.secretValueHidden)
          .map((secret) => secret.id);
        if (personalSecretIds.length) {
          await recordRead({ actor, actorId, projectId, secretIds: personalSecretIds, referencesExpanded: true });
        }
        return;
      }

      // A 304 carries no secrets. ETags are stored per UTC day, so each client's first read of the day gets a
      // full response, and that one is recorded.
      if (notModified) return;

      await recordRead({
        actor,
        actorId,
        projectId,
        secretIds: [
          ...[...secrets, ...imports.flatMap((secretImport) => secretImport.secrets)]
            .filter((secret) => !secret.secretValueHidden)
            .map((secret) => secret.id),
          ...(referencedSecretIds ?? [])
        ],
        referencesExpanded: referencedSecretIds ? false : expandSecretReferences
      });
    } catch (error) {
      logger.warn(error, `Failed to record secret read [projectId=${projectId}] [actorId=${actorId}]`);
    }
  };

  // A single read through a replication import returns the copy, which is checked against the reader's access
  // to the secret it was copied from, so the read is credited to that secret.
  const $findReplicatedSourceIds = async (tree: TProjectFolderTree, secretIds: string[]) => {
    const importIdByReplicaFolderId = new Map(
      tree.folders
        .filter((folder) => folder.isReserved && folder.name.startsWith(ReservedFolders.SecretReplication))
        .map((folder) => [folder.id, folder.name.slice(ReservedFolders.SecretReplication.length)])
    );
    if (!importIdByReplicaFolderId.size) return new Map<string, string>();

    // Looked up by folder, so the query is bounded by the replicas rather than by how many secrets were read.
    const readSecretIds = new Set(secretIds);
    const copies = (
      await secretV2BridgeDAL.find({
        $in: { [`${TableName.SecretV2}.folderId` as "folderId"]: [...importIdByReplicaFolderId.keys()] }
      })
    ).filter((secret) => readSecretIds.has(secret.id));
    if (!copies.length) return new Map<string, string>();

    const imports = await secretImportDAL.findByIds([
      ...new Set(copies.map((copy) => importIdByReplicaFolderId.get(copy.folderId) as string))
    ]);
    const sourceFolderIdByImportId = new Map(
      imports.flatMap((secretImport) => {
        const folderId = tree.folderIdByLocation.get(
          toLocationKey({ environment: secretImport.importEnv.slug, secretPath: secretImport.importPath })
        );
        return folderId ? [[secretImport.id, folderId] as const] : [];
      })
    );
    const sources = await secretV2BridgeDAL.find({
      $in: { [`${TableName.SecretV2}.folderId` as "folderId"]: [...new Set(sourceFolderIdByImportId.values())] },
      [`${TableName.SecretV2}.type` as "type"]: SecretType.Shared
    });
    const sourceIdByFolderAndKey = new Map(sources.map((source) => [`${source.folderId}:${source.key}`, source.id]));

    return new Map(
      copies.flatMap((copy) => {
        const sourceFolderId = sourceFolderIdByImportId.get(importIdByReplicaFolderId.get(copy.folderId) as string);
        const sourceId = sourceFolderId && sourceIdByFolderAndKey.get(`${sourceFolderId}:${copy.key}`);
        return sourceId ? [[copy.id, sourceId] as const] : [];
      })
    );
  };

  const $resolveProjectReads = async (projectId: string, reads: TSecretReadStreamEntry[]) => {
    const tree = await loadProjectFolderTree({ folderDAL, projectEnvDAL }, projectId);
    const subtrees = new Map<string, string[]>();
    const subtreeOf = (folderId: string) => {
      if (!subtrees.has(folderId)) {
        const prefix = tree.pathOf(folderId) === "/" ? "/" : `${tree.pathOf(folderId)}/`;
        const { envId } = tree.folderById[folderId];
        subtrees.set(
          folderId,
          tree.folders
            .filter(
              (folder) =>
                folder.envId === envId &&
                !folder.isReserved &&
                (folder.id === folderId || tree.pathOf(folder.id).startsWith(prefix))
            )
            .map((folder) => folder.id)
        );
      }
      return subtrees.get(folderId) as string[];
    };

    const rows: TSecretLastRead[] = [];
    const toRow = (read: TSecretReadStreamEntry, objectType: SecretReadObjectType, objectId: string) => ({
      objectId,
      objectType,
      actorId: read.actorId,
      actorType: read.actorType,
      lastReadAt: new Date(read.readAt)
    });

    reads.forEach((read) => {
      if (read.environment === undefined || read.secretPath === undefined) return;
      const folderId = tree.folderIdByLocation.get(
        toLocationKey({ environment: read.environment, secretPath: read.secretPath })
      );
      if (!folderId) return;
      (read.recursive ? subtreeOf(folderId) : [folderId]).forEach((id) =>
        rows.push(toRow(read, SecretReadObjectType.Folder, id))
      );
    });

    const secretReads = reads.filter((read) => read.secretIds?.length);
    if (secretReads.length) {
      const sourceIdByCopyId = await $findReplicatedSourceIds(
        tree,
        secretReads.flatMap((read) => read.secretIds as string[])
      );
      secretReads.forEach((read) => {
        const objectType = read.referencesExpanded
          ? SecretReadObjectType.Secret
          : SecretReadObjectType.SecretUnexpanded;
        (read.secretIds as string[]).forEach((secretId) =>
          rows.push(toRow(read, objectType, sourceIdByCopyId.get(secretId) ?? secretId))
        );
      });
    }
    return rows;
  };

  // Entries are trimmed only after they are written, so a failed batch is retried on the next run; the upsert
  // makes the retry harmless.
  const $flushReadStream = async () => {
    const { entries, lastId } = await keyStore.streamCollect(
      KeyStorePrefixes.SecretReadActivityStream,
      SECRET_READ_FLUSH_BATCH_SIZE,
      SECRET_READ_FLUSH_MAX_ENTRIES
    );
    if (!entries.length || !lastId) return;

    if (entries.length >= SECRET_READ_FLUSH_MAX_ENTRIES) {
      logger.warn(
        `secret-read-activity: stream backlog hit the collection ceiling [collected=${entries.length}] [maxEntries=${SECRET_READ_FLUSH_MAX_ENTRIES}]; the oldest reads risk being dropped by the stream's MAXLEN cap`
      );
    }

    const reads = entries.flatMap(([, fields]) => {
      try {
        return [JSON.parse(fields[fields.indexOf("data") + 1]) as TSecretReadStreamEntry];
      } catch (error) {
        logger.error(error, "secret-read-activity: Skipping unparseable stream entry");
        return [];
      }
    });

    const rows: TSecretLastRead[] = [];
    for (const [projectId, projectReads] of Object.entries(groupBy(reads, (read) => read.projectId))) {
      // eslint-disable-next-line no-await-in-loop
      const projectRows = await $resolveProjectReads(projectId, projectReads);
      // Not spread into push: a large batch resolves to more rows than fit in one call's arguments.
      for (const row of projectRows) rows.push(row);
    }
    // A read that waited in the stream past the window counts for nothing, and its month's partition may already be
    // dropped, so writing it would fail the whole batch on every retry.
    const windowStart = getReadActivityWindowStart();
    await secretReadActivityDAL.upsertLastReads(rows.filter((row) => row.lastReadAt >= windowStart));
    await keyStore.streamTrim(KeyStorePrefixes.SecretReadActivityStream, lastId, true);
    logger.info(`secret-read-activity: Flushed read stream [entries=${entries.length}] [rows=${rows.length}]`);
  };

  // A run can outlast the next fire under load. The upsert makes overlap harmless, but it doubles the work when
  // the stream is already behind, so a run that finds the lock held skips and leaves the backlog to the next one.
  const $consumeReadStream = async () => {
    let lock;
    try {
      lock = await keyStore.acquireLock(
        [KeyStorePrefixes.SecretReadActivityConsumerLock],
        SECRET_READ_CONSUMER_LOCK_TTL_MS,
        { retryCount: 0 }
      );
    } catch {
      return;
    }
    try {
      await $flushReadStream();
    } finally {
      await lock.release();
    }
  };

  const init = () => {
    const appCfg = getConfig();
    cronJob.register({
      name: CronJobName.SecretReadActivityFlush,
      pattern: "* * * * *",
      runHashTtlS: 60 * 60,
      handlerTimeoutMs: SECRET_READ_FLUSH_TIMEOUT_MS,
      enabled: !appCfg.isSecondaryInstance,
      handler: $consumeReadStream
    });
    // Daily although a month's partition is needed once: partitions exist months ahead, so a missed run costs
    // nothing, and an instance back from a longer outage gets them within a day while its reads wait in the stream.
    cronJob.register({
      name: CronJobName.SecretReadActivityPrune,
      pattern: "15 1 * * *",
      runHashTtlS: 3 * 24 * 60 * 60,
      enabled: !appCfg.isSecondaryInstance,
      handler: async () => {
        const created = await secretReadActivityDAL.createMonthlyPartitions(
          getUtcMonthStart(new Date()),
          SECRET_READ_PARTITION_MONTHS_AHEAD + 1
        );
        // Nothing reads before the window, so a month is dropped once all of it has left the window.
        const dropped = await secretReadActivityDAL.dropPartitionsEndingBefore(getReadActivityWindowStart());
        logger.info(
          `cron[${CronJobName.SecretReadActivityPrune}]: Maintained partitions [created=${created}] [dropped=${dropped}]`
        );
      }
    });
  };

  return { init, recordRead, recordBulkRead };
};
