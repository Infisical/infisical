import { SecretType, TableName } from "@app/db/schemas";
import { DAY_IN_MS } from "@app/ee/services/audit-report/audit-report-fns";
import { reviveDates } from "@app/ee/services/insights/insights-fns";
import { checkInsightsPermission } from "@app/ee/services/insights/insights-service";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import {
  hasSecretReadValueOrDescribePermission,
  throwIfMissingSecretReadValueOrDescribePermission
} from "@app/ee/services/permission/permission-fns";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectPermissionSecretActions } from "@app/ee/services/permission/project-permission";
import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";
import { getCacheTtl, withCache } from "@app/lib/cache/with-cache";
import { getConfig } from "@app/lib/config/env";
import { CronJobName, TCronJobFactory } from "@app/lib/cron/cron-job";
import { generateCacheKeyFromData } from "@app/lib/crypto/cache";
import { NotFoundError } from "@app/lib/errors";
import { chunkArray, groupBy } from "@app/lib/fn";
import { logger } from "@app/lib/logger";
import { OrderByDirection, OrgServiceActor } from "@app/lib/types";
import { ActorType } from "@app/services/auth/auth-type";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TProjectEnvDALFactory } from "@app/services/project-env/project-env-dal";
import { TSecretFolderDALFactory } from "@app/services/secret-folder/secret-folder-dal";
import { buildFolderIdMap, buildFolderPath } from "@app/services/secret-folder/secret-folder-fns";
import { ReservedFolders } from "@app/services/secret-folder/secret-folder-types";
import { TSecretImportDALFactory } from "@app/services/secret-import/secret-import-dal";
import { getAllSecretReferences } from "@app/services/secret-v2-bridge/secret-reference-fns";
import { TSecretV2BridgeDALFactory } from "@app/services/secret-v2-bridge/secret-v2-bridge-dal";

import { TSecretReadActivityDALFactory } from "./secret-read-activity-dal";
import {
  classifySecretReads,
  computeSecretReach,
  coversWholeWindow,
  getUtcMonthStart,
  indexSecretReads,
  normalizeSecretPath,
  toLocationKey
} from "./secret-read-activity-fns";
import {
  SecretReadObjectType,
  SecretReadStatus,
  TGetSecretReadActivityDTO,
  TListUnusedSecretAccessDTO,
  TReadActivityScope,
  TRecordBulkSecretReadDTO,
  TRecordSecretReadDTO,
  TSecretLastRead,
  TSecretReachGraph,
  TSecretReaderType,
  TSecretReadStreamEntry,
  TUnusedSecretAccess
} from "./secret-read-activity-types";

const SECRET_READ_ACTIVITY_WINDOW_DAYS = 30;
// Matches the migration, which creates the first partitions.
const SECRET_READ_PARTITION_MONTHS_AHEAD = 3;
const SECRET_READ_GATE_TTL_SECONDS = 25 * 60 * 60;
const SECRET_READ_STREAM_MAX_LENGTH = 100_000;
const SECRET_READ_FLUSH_BATCH_SIZE = 1000;
const SECRET_READ_FLUSH_MAX_ENTRIES = 50_000;
const SECRET_READ_CONSUMER_LOCK_TTL_MS = 60_000;
const SECRET_READ_STREAM_ENTRY_MAX_SECRETS = 1000;
const UNUSED_SECRET_ACCESS_CACHE_TTL_SECONDS = 30;

type TSecretReadActivityServiceFactoryDep = {
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission" | "getProjectPermissions">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  secretReadActivityDAL: TSecretReadActivityDALFactory;
  folderDAL: Pick<TSecretFolderDALFactory, "findByProjectId">;
  projectDAL: Pick<TProjectDALFactory, "findById">;
  projectEnvDAL: Pick<TProjectEnvDALFactory, "find">;
  secretImportDAL: Pick<TSecretImportDALFactory, "find" | "findByIds">;
  secretV2BridgeDAL: Pick<TSecretV2BridgeDALFactory, "find" | "findSecretReferencesByProjectId">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  keyStore: Pick<
    TKeyStoreFactory,
    | "setItemWithExpiry"
    | "getItem"
    | "ttl"
    | "setItemWithExpiryNX"
    | "deleteItem"
    | "streamAdd"
    | "streamCollect"
    | "streamTrim"
    | "acquireLock"
  >;
  cronJob: TCronJobFactory;
};

export type TSecretReadActivityServiceFactory = ReturnType<typeof secretReadActivityServiceFactory>;

export const secretReadActivityServiceFactory = ({
  permissionService,
  licenseService,
  secretReadActivityDAL,
  folderDAL,
  projectDAL,
  projectEnvDAL,
  secretImportDAL,
  secretV2BridgeDAL,
  kmsService,
  keyStore,
  cronJob
}: TSecretReadActivityServiceFactoryDep) => {
  const $loadProjectTree = async (projectId: string) => {
    const [folders, environments] = await Promise.all([
      folderDAL.findByProjectId(projectId),
      projectEnvDAL.find({ projectId })
    ]);
    const folderById = buildFolderIdMap(folders);
    const envById = new Map(environments.map((env) => [env.id, env]));
    const paths = new Map<string, string>();
    const pathOf = (folderId: string) => {
      if (!paths.has(folderId)) paths.set(folderId, buildFolderPath(folderById[folderId], folderById));
      return paths.get(folderId) as string;
    };
    const locationOf = (folderId: string) => {
      const env = folderById[folderId] && envById.get(folderById[folderId].envId);
      return env ? { environment: env.slug, secretPath: pathOf(folderId) } : undefined;
    };
    const folderIdByLocation = new Map(
      folders.flatMap((folder) => {
        const location = locationOf(folder.id);
        return location ? [[toLocationKey(location), folder.id] as const] : [];
      })
    );
    return { folders, folderById, envById, pathOf, locationOf, folderIdByLocation };
  };

  let trackingStartedAt: Promise<Date | undefined> | undefined;
  const $getTrackingStartedAt = () => {
    trackingStartedAt ??= secretReadActivityDAL.findTrackingStartedAt().catch((error) => {
      trackingStartedAt = undefined;
      throw error;
    });
    return trackingStartedAt;
  };

  const $isTrackedReader = (actor: ActorType): actor is TSecretReaderType =>
    actor === ActorType.USER || actor === ActorType.IDENTITY;

  // Called once a read's response is built and never awaited by it. Only the first matching read per reader
  // per day reaches the stream, so a client polling every minute costs one Redis call per read.
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
      logger.warn(error, `Failed to record secret read [projectId=${projectId}] [actorId=${actorId}]`);
    }
  };

  const recordRead = async ({ actor, actorId, projectId, secretIds, referencesExpanded }: TRecordSecretReadDTO) => {
    if (!$isTrackedReader(actor) || !secretIds.length) return;

    const uniqueSecretIds = [...new Set(secretIds)].sort();
    await $record(
      { actor, actorId, projectId },
      `secrets:${String(referencesExpanded)}:${generateCacheKeyFromData(uniqueSecretIds)}`,
      chunkArray(uniqueSecretIds, SECRET_READ_STREAM_ENTRY_MAX_SECRETS).map((chunk) => ({
        secretIds: chunk,
        referencesExpanded
      }))
    );
  };

  // A read that returned whole folders (no filters, imports and references included) is recorded against
  // them. A narrower one is recorded against the secrets it returned, so the secrets it left out are not
  // credited.
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
    notModified,
    secrets,
    imports = []
  }: TRecordBulkSecretReadDTO) => {
    if (!$isTrackedReader(actor)) return;

    if (!isFiltered && includeImports && expandSecretReferences) {
      const normalizedPath = normalizeSecretPath(secretPath);
      await $record(
        { actor, actorId, projectId },
        `folder:${projectId}:${environment}:${normalizedPath}:${String(recursive)}`,
        [{ environment, secretPath: normalizedPath, recursive }]
      );
      return;
    }

    // A 304 carries no secrets. ETags are stored per UTC day, so each client's first read of the day gets a
    // full response, and that one is recorded.
    if (notModified) return;

    await recordRead({
      actor,
      actorId,
      projectId,
      secretIds: [...secrets, ...imports.flatMap((secretImport) => secretImport.secrets)]
        .filter((secret) => !secret.secretValueHidden)
        .map((secret) => secret.id),
      referencesExpanded: expandSecretReferences
    });
  };

  // A single read through a replication import returns the copy, which is checked against the reader's access
  // to the secret it was copied from, so the read is credited to that secret.
  const $findReplicatedSourceIds = async (tree: Awaited<ReturnType<typeof $loadProjectTree>>, secretIds: string[]) => {
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
    const tree = await $loadProjectTree(projectId);
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
      rows.push(...(await $resolveProjectReads(projectId, projectReads)));
    }
    await secretReadActivityDAL.upsertLastReads(rows);
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

  const $getWindowStart = () => new Date(Date.now() - SECRET_READ_ACTIVITY_WINDOW_DAYS * DAY_IN_MS);

  const init = () => {
    const appCfg = getConfig();
    cronJob.register({
      name: CronJobName.SecretReadActivityFlush,
      pattern: "* * * * *",
      runHashTtlS: 60 * 60,
      enabled: !appCfg.isSecondaryInstance,
      handler: $consumeReadStream
    });
    // Hourly although a month's partition is needed once, so that an instance back from a long outage gets
    // partitions for its reads within the hour.
    cronJob.register({
      name: CronJobName.SecretReadActivityPrune,
      pattern: "15 * * * *",
      runHashTtlS: 24 * 60 * 60,
      enabled: !appCfg.isSecondaryInstance,
      handler: async () => {
        const created = await secretReadActivityDAL.createMonthlyPartitions(
          getUtcMonthStart(new Date()),
          SECRET_READ_PARTITION_MONTHS_AHEAD + 1
        );
        // Nothing reads before the window, so a month is dropped once all of it has left the window.
        const dropped = await secretReadActivityDAL.dropPartitionsEndingBefore($getWindowStart());
        logger.info(
          `cron[${CronJobName.SecretReadActivityPrune}]: Maintained partitions [created=${created}] [dropped=${dropped}]`
        );
      }
    });
  };

  const $getReadActivity = async ({ projectId, windowStart, secret: requestedSecret }: TReadActivityScope) => {
    const tree = await $loadProjectTree(projectId);
    const { folders, folderById, locationOf, pathOf } = tree;

    const requestedFolderId =
      requestedSecret &&
      tree.folderIdByLocation.get(
        toLocationKey({ environment: requestedSecret.environment, secretPath: requestedSecret.secretPath })
      );
    if (requestedSecret && !requestedFolderId) {
      throw new NotFoundError({
        message: `Folder with path '${requestedSecret.secretPath}' in environment '${requestedSecret.environment}' not found`
      });
    }
    const scopeFolderIds = requestedFolderId
      ? [requestedFolderId]
      : folders.filter((folder) => !folder.isReserved).map((folder) => folder.id);

    const referencesByLocation = groupBy(
      await secretV2BridgeDAL.findSecretReferencesByProjectId(projectId),
      (reference) => toLocationKey(reference)
    );
    const referencesOf = (folderId: string) => {
      const location = locationOf(folderId);
      return location ? (referencesByLocation[toLocationKey(location)] ?? []) : [];
    };

    // Secrets referencing a loaded one can sit outside the scope, so their folders are loaded too, until no
    // new folders turn up.
    type TSecret = Awaited<ReturnType<typeof secretV2BridgeDAL.find>>[number];
    const secretsByFolder = new Map<string, TSecret[]>();
    let pendingFolderIds = scopeFolderIds;
    while (pendingFolderIds.length) {
      const folderIds = pendingFolderIds;
      // eslint-disable-next-line no-await-in-loop
      const secrets = await secretV2BridgeDAL.find({
        $in: { [`${TableName.SecretV2}.folderId` as "folderId"]: folderIds }
      });
      const secretsByFolderId = groupBy(secrets, (secret) => secret.folderId);
      folderIds.forEach((folderId) => secretsByFolder.set(folderId, secretsByFolderId[folderId] ?? []));
      pendingFolderIds = [...new Set(folderIds.flatMap(referencesOf).map((reference) => reference.folderId))].filter(
        (folderId) => folderById[folderId] && !secretsByFolder.has(folderId)
      );
    }

    const { decryptor } = await kmsService.createCipherPairWithDataKey({ type: KmsDataKey.SecretManager, projectId });
    const localReferences = new Map<string, string[]>();
    const localReferencesOf = (secret: TSecret) => {
      if (!localReferences.has(secret.id)) {
        localReferences.set(
          secret.id,
          secret.encryptedValue
            ? getAllSecretReferences(decryptor({ cipherTextBlob: secret.encryptedValue }).toString()).localReferences
            : []
        );
      }
      return localReferences.get(secret.id) as string[];
    };

    // Replication imports are included: a replicated copy is checked against the reader's access to its source.
    const importsByLocation = groupBy(await secretImportDAL.find({ projectId }), (secretImport) =>
      toLocationKey({ environment: secretImport.importEnv.id, secretPath: secretImport.importPath })
    );
    const secretById = new Map([...secretsByFolder.values()].flat().map((secret) => [secret.id, secret]));
    const graph: TSecretReachGraph = {
      getReferencers: ({ id, folderId, key }) => [
        ...(secretsByFolder.get(folderId) ?? []).filter(
          (other) => other.id !== id && key !== undefined && localReferencesOf(other).includes(key)
        ),
        ...referencesOf(folderId)
          .filter((reference) => reference.secretKey === key)
          .map(
            (reference) =>
              secretById.get(reference.secretId) ?? { id: reference.secretId, folderId: reference.folderId }
          )
      ],
      getImporterFolderIds: (folderId) =>
        folderById[folderId]
          ? (
              importsByLocation[
                toLocationKey({ environment: folderById[folderId].envId, secretPath: pathOf(folderId) })
              ] ?? []
            ).map((secretImport) => secretImport.folderId)
          : []
    };

    const targets = scopeFolderIds.flatMap((folderId) => {
      const location = locationOf(folderId);
      if (!location) return [];
      return (secretsByFolder.get(folderId) ?? [])
        .filter(
          (secret) =>
            secret.type === SecretType.Shared && (!requestedSecret || secret.key === requestedSecret.secretName)
        )
        .map((secret) => ({ secret, ...location }));
    });
    const reaches = targets.map(({ secret }) => computeSecretReach(secret, graph));
    const reads = indexSecretReads(
      await secretReadActivityDAL.findLastReads(
        [...new Set(reaches.flatMap((reach) => [...reach.folderIds, ...reach.secretIds]))],
        windowStart
      )
    );

    // Reads are matched by folder and secret ids, so renames do not matter. A move creates new ids, so the
    // window starts no earlier than the secret and its folder were created, nor before tracking began.
    const trackingStart = (await $getTrackingStartedAt())?.getTime() ?? 0;
    return targets.map(({ secret, environment, secretPath }, index) => {
      const trackedSince = new Date(
        Math.max(
          windowStart.getTime(),
          trackingStart,
          secret.createdAt.getTime(),
          folderById[secret.folderId].createdAt.getTime()
        )
      );
      return {
        secret,
        environment,
        secretPath,
        trackedSince,
        reads: classifySecretReads(reads, reaches[index], trackedSince)
      };
    });
  };

  const getSecretReadActivity = async (
    { projectId, environment, secretPath, secretName }: TGetSecretReadActivityDTO,
    actor: OrgServiceActor
  ) => {
    const { permission } = await checkInsightsPermission(permissionService, licenseService, projectId, actor);

    const [activity] = await $getReadActivity({
      projectId,
      windowStart: $getWindowStart(),
      secret: { environment, secretPath, secretName }
    });
    if (!activity) {
      throw new NotFoundError({
        message: `Secret with name '${secretName}' not found at path '${secretPath}' in environment '${environment}'`
      });
    }
    throwIfMissingSecretReadValueOrDescribePermission(permission, ProjectPermissionSecretActions.DescribeSecret, {
      environment,
      secretPath,
      secretName,
      secretTags: activity.secret.tags?.map((tag) => tag.slug)
    });

    return { trackedSince: activity.trackedSince, reads: [...activity.reads.values()] };
  };

  // Everyone who can read a secret's value but has not read it in the whole window, ranked by the secrets with the
  // most of them.
  const $computeUnusedSecretAccess = async (projectId: string, orgId: string) => {
    const windowStart = $getWindowStart();
    const [activities, { userPermissions, identityPermissions }, accessChangedAtByActorId] = await Promise.all([
      $getReadActivity({ projectId, windowStart }),
      permissionService.getProjectPermissions(projectId, orgId),
      secretReadActivityDAL.findAccessChangedAt(projectId)
    ]);
    // Principals with identical rules always get the same answer, so each distinct rule set is checked once.
    const principalGroups = Object.values(
      groupBy(
        [
          ...userPermissions.map((principal) => ({ ...principal, actorType: ActorType.USER as const })),
          ...identityPermissions.map((principal) => ({ ...principal, actorType: ActorType.IDENTITY as const }))
        ],
        (principal) => JSON.stringify(principal.permission.rules)
      )
    );

    const rowsBySecret: TUnusedSecretAccess[][] = [];
    for (const { secret, environment, secretPath, trackedSince, reads } of activities) {
      // Permission checks are synchronous, so yield between secrets to keep a large project from blocking other requests.
      // eslint-disable-next-line no-await-in-loop
      await new Promise<void>((resolve) => {
        setImmediate(resolve);
      });
      const subjectFields = {
        environment,
        secretPath,
        secretName: secret.key,
        secretTags: secret.tags?.map((tag) => tag.slug)
      };
      rowsBySecret.push(
        principalGroups
          .filter(([{ permission }]) =>
            hasSecretReadValueOrDescribePermission(permission, ProjectPermissionSecretActions.ReadValue, subjectFields)
          )
          .flat()
          .flatMap((principal) => {
            if (
              reads.has(`${principal.actorType}:${principal.id}`) ||
              !coversWholeWindow(trackedSince, accessChangedAtByActorId.get(principal.id), windowStart)
            ) {
              return [];
            }
            return {
              secretKey: secret.key,
              environment,
              secretPath,
              principalType: principal.actorType,
              principalId: principal.id,
              principalName: principal.name,
              readStatus: SecretReadStatus.NoReads,
              lastReadAt: null
            };
          })
      );
    }
    return rowsBySecret.sort((a, b) => b.length - a.length).flat();
  };

  // The whole project is computed once and cached, so paging through it is cheap.
  const listUnusedSecretAccess = async (
    { projectId, offset, limit, orderBy, orderDirection }: TListUnusedSecretAccessDTO,
    actor: OrgServiceActor
  ) => {
    await checkInsightsPermission(permissionService, licenseService, projectId, actor);

    const cacheKey = KeyStorePrefixes.InsightsCache(projectId, "unused-secret-access");
    const unusedAccess = await withCache({
      keyStore,
      key: cacheKey,
      ttlSeconds: UNUSED_SECRET_ACCESS_CACHE_TTL_SECONDS,
      fetcher: () => $computeUnusedSecretAccess(projectId, actor.orgId),
      reviver: (parsed) => {
        reviveDates(parsed, "lastReadAt");
      }
    });
    const [remainingTTL, instanceTrackingStartedAt, project] = await Promise.all([
      getCacheTtl(keyStore, cacheKey),
      $getTrackingStartedAt(),
      projectDAL.findById(projectId)
    ]);
    // Reads are known from the later of when tracking began and when the project was created, and nothing can be
    // called unused until a whole window has passed since then.
    const projectTrackingStartedAt = new Date(
      Math.max(instanceTrackingStartedAt?.getTime() ?? 0, project?.createdAt.getTime() ?? 0)
    );

    // Unsorted, the list keeps its ranking. The sort is stable, so ties keep it too.
    const sorted = orderBy
      ? [...unusedAccess].sort((a, b) => {
          const [first, second] = orderDirection === OrderByDirection.DESC ? [b, a] : [a, b];
          return first[orderBy].localeCompare(second[orderBy]);
        })
      : unusedAccess;

    return {
      unusedAccess: sorted.slice(offset, offset + limit),
      totalCount: sorted.length,
      trackingStartedAt: projectTrackingStartedAt,
      unusedAccessFrom: new Date(projectTrackingStartedAt.getTime() + SECRET_READ_ACTIVITY_WINDOW_DAYS * DAY_IN_MS),
      remainingTTL
    };
  };

  return { init, recordRead, recordBulkRead, getSecretReadActivity, listUnusedSecretAccess };
};
