import { SecretType, TableName } from "@app/db/schemas";
import { DAY_IN_MS } from "@app/ee/services/audit-report/audit-report-fns";
import { checkInsightsReadPermission } from "@app/ee/services/insights/insights-fns";
import {
  hasSecretReadValueOrDescribePermission,
  throwIfMissingSecretReadValueOrDescribePermission
} from "@app/ee/services/permission/permission-fns";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectPermissionSecretActions } from "@app/ee/services/permission/project-permission";
import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";
import { getCacheTtl, withCache } from "@app/lib/cache/with-cache";
import { NotFoundError } from "@app/lib/errors";
import { groupBy } from "@app/lib/fn";
import { OrderByDirection, OrgServiceActor } from "@app/lib/types";
import { ActorType } from "@app/services/auth/auth-type";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TProjectEnvDALFactory } from "@app/services/project-env/project-env-dal";
import { TSecretFolderDALFactory } from "@app/services/secret-folder/secret-folder-dal";
import { TSecretImportDALFactory } from "@app/services/secret-import/secret-import-dal";
import { getAllSecretReferences } from "@app/services/secret-v2-bridge/secret-reference-fns";
import { TSecretV2BridgeDALFactory } from "@app/services/secret-v2-bridge/secret-v2-bridge-dal";

import { TSecretReadActivityDALFactory } from "./secret-read-activity-dal";
import {
  classifySecretReads,
  computeSecretReach,
  coversWholeWindow,
  getReadActivityWindowStart,
  indexSecretReads,
  loadProjectFolderTree,
  SECRET_READ_ACTIVITY_WINDOW_DAYS,
  toLocationKey,
  TProjectFolderTree
} from "./secret-read-activity-fns";
import { TSecretReadActivityQueueServiceFactory } from "./secret-read-activity-queue";
import {
  TGetSecretReadActivityDTO,
  TListUnusedSecretAccessDTO,
  TReachSecret,
  TReadActivityScope,
  TSecretReach,
  TSecretReachGraph,
  TUnusedSecretAccess
} from "./secret-read-activity-types";

const UNUSED_SECRET_ACCESS_CACHE_TTL_SECONDS = 24 * 60 * 60;
const REACH_YIELD_INTERVAL = 100;
// Longer than a computation can take, so the lock is not lost mid-scan; waiters give up well before a request times out.
const UNUSED_SECRET_ACCESS_COMPUTE_LOCK_TTL_MS = 5 * 60 * 1000;
const UNUSED_SECRET_ACCESS_COMPUTE_WAIT_SECONDS = 60;
// A large project can have millions of unread secret and actor pairs, so only the highest-ranked entries are
// cached and listed, about 200 KB per project.
const UNUSED_SECRET_ACCESS_MAX_LISTED = 1000;

type TCachedUnusedSecretAccess = TUnusedSecretAccess & { secretId: string };

type TSecretReadActivityServiceFactoryDep = {
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission" | "getProjectPermissions">;
  secretReadActivityDAL: Pick<
    TSecretReadActivityDALFactory,
    "findLastReads" | "findTrackingStartedAt" | "findAccessChangedAt"
  >;
  secretReadActivityQueue: Pick<TSecretReadActivityQueueServiceFactory, "recordRead" | "recordBulkRead">;
  folderDAL: Pick<TSecretFolderDALFactory, "findByProjectId">;
  projectDAL: Pick<TProjectDALFactory, "findById">;
  projectEnvDAL: Pick<TProjectEnvDALFactory, "find">;
  secretImportDAL: Pick<TSecretImportDALFactory, "find">;
  secretV2BridgeDAL: Pick<TSecretV2BridgeDALFactory, "find" | "findSecretReferencesByProjectId">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  keyStore: Pick<TKeyStoreFactory, "setItemWithExpiry" | "getItem" | "ttl" | "acquireLock">;
};

export type TSecretReadActivityServiceFactory = ReturnType<typeof secretReadActivityServiceFactory>;

export const secretReadActivityServiceFactory = ({
  permissionService,
  secretReadActivityDAL,
  secretReadActivityQueue,
  folderDAL,
  projectDAL,
  projectEnvDAL,
  secretImportDAL,
  secretV2BridgeDAL,
  kmsService,
  keyStore
}: TSecretReadActivityServiceFactoryDep) => {
  let trackingStartedAt: Promise<Date | undefined> | undefined;
  const $getTrackingStartedAt = () => {
    trackingStartedAt ??= secretReadActivityDAL.findTrackingStartedAt().catch((error) => {
      trackingStartedAt = undefined;
      throw error;
    });
    return trackingStartedAt;
  };

  const $getReadActivity = async ({
    projectId,
    windowStart,
    secret: requestedSecret,
    tree: loadedTree
  }: TReadActivityScope & { tree?: TProjectFolderTree }) => {
    const tree = loadedTree ?? (await loadProjectFolderTree({ folderDAL, projectEnvDAL }, projectId));
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
    const secretById = new Map([...secretsByFolder.values()].flat().map((secret) => [secret.id, secret]));

    // Indexed by referenced key once per folder: scanning the folder again for every secret in it would be
    // quadratic in the folder's size, and the reach is computed synchronously.
    const referencersByFolder = new Map<string, Map<string, TReachSecret[]>>();
    const referencersOf = (folderId: string) => {
      const indexed = referencersByFolder.get(folderId);
      if (indexed) return indexed;

      const referencersByKey = new Map<string, TReachSecret[]>();
      const add = (key: string, referencer: TReachSecret) => {
        const referencers = referencersByKey.get(key);
        if (referencers) referencers.push(referencer);
        else referencersByKey.set(key, [referencer]);
      };
      (secretsByFolder.get(folderId) ?? []).forEach((secret) => {
        if (!secret.encryptedValue) return;
        const { localReferences } = getAllSecretReferences(
          decryptor({ cipherTextBlob: secret.encryptedValue }).toString()
        );
        new Set(localReferences).forEach((key) => add(key, secret));
      });
      referencesOf(folderId).forEach((reference) =>
        add(
          reference.secretKey,
          secretById.get(reference.secretId) ?? { id: reference.secretId, folderId: reference.folderId }
        )
      );
      referencersByFolder.set(folderId, referencersByKey);
      return referencersByKey;
    };

    // Replication imports are included: a replicated copy is checked against the reader's access to its source.
    const importsByLocation = groupBy(await secretImportDAL.find({ projectId }), (secretImport) =>
      toLocationKey({ environment: secretImport.importEnv.id, secretPath: secretImport.importPath })
    );
    const graph: TSecretReachGraph = {
      getReferencers: ({ id, folderId, key }) =>
        key === undefined ? [] : (referencersOf(folderId).get(key) ?? []).filter((referencer) => referencer.id !== id),
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
    // Each reach is synchronous work, so yield between batches to keep a large project from blocking other requests.
    const reaches: TSecretReach[] = [];
    for (let index = 0; index < targets.length; index += 1) {
      if (index > 0 && index % REACH_YIELD_INTERVAL === 0) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise<void>((resolve) => {
          setImmediate(resolve);
        });
      }
      reaches.push(computeSecretReach(targets[index].secret, graph));
    }
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
    const { permission } = await checkInsightsReadPermission(permissionService, projectId, actor);

    // The secret is checked before the reach is built, which decrypts every secret that could reference it.
    const tree = await loadProjectFolderTree({ folderDAL, projectEnvDAL }, projectId);
    const folderId = tree.folderIdByLocation.get(toLocationKey({ environment, secretPath }));
    const [secret] = folderId
      ? await secretV2BridgeDAL.find({
          [`${TableName.SecretV2}.folderId` as "folderId"]: folderId,
          [`${TableName.SecretV2}.key` as "key"]: secretName,
          [`${TableName.SecretV2}.type` as "type"]: SecretType.Shared
        })
      : [];
    if (!secret) {
      throw new NotFoundError({
        message: `Secret with name '${secretName}' not found at path '${secretPath}' in environment '${environment}'`
      });
    }
    throwIfMissingSecretReadValueOrDescribePermission(permission, ProjectPermissionSecretActions.DescribeSecret, {
      environment,
      secretPath,
      secretName,
      secretTags: secret.tags?.map((tag) => tag.slug)
    });

    const [activity] = await $getReadActivity({
      projectId,
      windowStart: getReadActivityWindowStart(),
      secret: { environment, secretPath, secretName },
      tree
    });
    if (!activity) {
      throw new NotFoundError({
        message: `Secret with name '${secretName}' not found at path '${secretPath}' in environment '${environment}'`
      });
    }
    return { trackedSince: activity.trackedSince, reads: [...activity.reads.values()] };
  };

  // Everyone who can read a secret's value but has not read it in the whole window, ranked by the secrets with the
  // most of them.
  const $computeUnusedSecretAccess = async (projectId: string, orgId: string) => {
    const windowStart = getReadActivityWindowStart();
    const [activities, { userPermissions, identityPermissions }, accessChangedAtByActorId] = await Promise.all([
      $getReadActivity({ projectId, windowStart }),
      permissionService.getProjectPermissions(projectId, orgId),
      secretReadActivityDAL.findAccessChangedAt(projectId)
    ]);
    // Actors with identical rules always get the same answer, so each distinct rule set is checked once.
    const actorGroups = Object.values(
      groupBy(
        [
          ...userPermissions.map((actor) => ({ ...actor, actorType: ActorType.USER as const })),
          ...identityPermissions.map((actor) => ({ ...actor, actorType: ActorType.IDENTITY as const }))
        ],
        (actor) => JSON.stringify(actor.permission.rules)
      )
    );

    const unreadActorsOf = ({ secret, environment, secretPath, trackedSince, reads }: (typeof activities)[number]) =>
      actorGroups
        .filter(([{ permission }]) =>
          hasSecretReadValueOrDescribePermission(permission, ProjectPermissionSecretActions.ReadValue, {
            environment,
            secretPath,
            secretName: secret.key,
            secretTags: secret.tags?.map((tag) => tag.slug)
          })
        )
        .flat()
        .filter(
          (actor) =>
            !reads.has(`${actor.actorType}:${actor.id}`) &&
            coversWholeWindow(trackedSince, accessChangedAtByActorId.get(actor.id), windowStart)
        );

    // Only counts are kept for every secret: a large project can have millions of unread pairs, and only the
    // highest-ranked ones are listed, so their rows are built in a second pass.
    const unreadCounts: { activityIndex: number; count: number }[] = [];
    for (let activityIndex = 0; activityIndex < activities.length; activityIndex += 1) {
      // Permission checks are synchronous, so yield between secrets to keep a large project from blocking other requests.
      // eslint-disable-next-line no-await-in-loop
      await new Promise<void>((resolve) => {
        setImmediate(resolve);
      });
      unreadCounts.push({ activityIndex, count: unreadActorsOf(activities[activityIndex]).length });
    }
    unreadCounts.sort((a, b) => b.count - a.count);

    const rows: TCachedUnusedSecretAccess[] = [];
    for (const { activityIndex, count } of unreadCounts) {
      if (rows.length >= UNUSED_SECRET_ACCESS_MAX_LISTED || count === 0) break;
      const activity = activities[activityIndex];
      unreadActorsOf(activity).forEach((actor) =>
        rows.push({
          secretId: activity.secret.id,
          secretKey: activity.secret.key,
          environment: activity.environment,
          secretPath: activity.secretPath,
          actorType: actor.actorType,
          actorId: actor.id,
          actorName: actor.name
        })
      );
    }
    return {
      rows: rows.slice(0, UNUSED_SECRET_ACCESS_MAX_LISTED),
      totalCount: unreadCounts.reduce((total, { count }) => total + count, 0)
    };
  };

  // Requests on a cold cache, on any instance, wait for the one computing the project and read what it cached
  // instead of each scanning the project. If the wait runs out, the request computes it itself.
  const $computeUnusedSecretAccessShared = async (projectId: string, orgId: string, cacheKey: string) => {
    let lock: Awaited<ReturnType<typeof keyStore.acquireLock>> | undefined;
    try {
      lock = await keyStore.acquireLock(
        [KeyStorePrefixes.SecretReadActivityUnusedAccessLock(projectId)],
        UNUSED_SECRET_ACCESS_COMPUTE_LOCK_TTL_MS,
        { retryCount: UNUSED_SECRET_ACCESS_COMPUTE_WAIT_SECONDS, retryDelay: 1000 }
      );
    } catch {
      lock = undefined;
    }
    try {
      const cached = lock ? await keyStore.getItem(cacheKey) : null;
      if (cached) return JSON.parse(cached) as Awaited<ReturnType<typeof $computeUnusedSecretAccess>>;

      const result = await $computeUnusedSecretAccess(projectId, orgId);
      // Written before the lock is released, so the next request in line finds it.
      await keyStore.setItemWithExpiry(cacheKey, UNUSED_SECRET_ACCESS_CACHE_TTL_SECONDS, JSON.stringify(result));
      return result;
    } finally {
      await lock?.release();
    }
  };

  // The whole project is computed once a day and cached, so paging through it is cheap.
  const listUnusedSecretAccess = async (
    { projectId, offset, limit, orderBy, orderDirection }: TListUnusedSecretAccessDTO,
    actor: OrgServiceActor
  ) => {
    const { permission } = await checkInsightsReadPermission(permissionService, projectId, actor);

    const cacheKey = KeyStorePrefixes.InsightsCache(projectId, "unused-secret-access");
    const { rows, totalCount } = await withCache({
      keyStore,
      key: cacheKey,
      ttlSeconds: UNUSED_SECRET_ACCESS_CACHE_TTL_SECONDS,
      fetcher: () => $computeUnusedSecretAccessShared(projectId, actor.orgId, cacheKey)
    });
    const [remainingTTL, instanceTrackingStartedAt, project, tree, currentSecrets] = await Promise.all([
      getCacheTtl(keyStore, cacheKey),
      $getTrackingStartedAt(),
      projectDAL.findById(projectId),
      loadProjectFolderTree({ folderDAL, projectEnvDAL }, projectId),
      rows.length
        ? secretV2BridgeDAL.find({
            $in: { [`${TableName.SecretV2}.id` as "id"]: [...new Set(rows.map((row) => row.secretId))] }
          })
        : []
    ]);
    // Reads are known from the later of when tracking began and when the project was created, and nothing can be
    // called unused until a whole window has passed since then.
    const projectTrackingStartedAt = new Date(
      Math.max(instanceTrackingStartedAt?.getTime() ?? 0, project?.createdAt.getTime() ?? 0)
    );

    // The cache is shared by everyone in the project and can be a day old, so each row is checked against the
    // secret as it is now: deleted secrets drop out, and a caller only gets the secrets they could see anyway.
    const currentSecretById = new Map(currentSecrets.map((secret) => [secret.id, secret]));
    const visibleRows = rows.flatMap(({ secretId, ...row }): TUnusedSecretAccess[] => {
      const secret = currentSecretById.get(secretId);
      const location = secret && tree.locationOf(secret.folderId);
      if (!secret || !location) return [];
      const canDescribe = hasSecretReadValueOrDescribePermission(
        permission,
        ProjectPermissionSecretActions.DescribeSecret,
        {
          environment: location.environment,
          secretPath: location.secretPath,
          secretName: secret.key,
          secretTags: secret.tags?.map((tag) => tag.slug)
        }
      );
      return canDescribe ? [{ ...row, secretKey: secret.key, ...location }] : [];
    });

    // Unsorted, the list keeps its ranking. The sort is stable, so ties keep it too.
    const sorted = orderBy
      ? [...visibleRows].sort((a, b) => {
          const [first, second] = orderDirection === OrderByDirection.DESC ? [b, a] : [a, b];
          return first[orderBy].localeCompare(second[orderBy]);
        })
      : visibleRows;

    return {
      unusedAccess: sorted.slice(offset, offset + limit),
      totalCount: visibleRows.length,
      unlistedCount: totalCount - rows.length,
      projectName: project?.name ?? "",
      trackingStartedAt: projectTrackingStartedAt,
      unusedAccessFrom: new Date(projectTrackingStartedAt.getTime() + SECRET_READ_ACTIVITY_WINDOW_DAYS * DAY_IN_MS),
      remainingTTL
    };
  };

  return {
    recordRead: secretReadActivityQueue.recordRead,
    recordBulkRead: secretReadActivityQueue.recordBulkRead,
    getSecretReadActivity,
    listUnusedSecretAccess
  };
};
