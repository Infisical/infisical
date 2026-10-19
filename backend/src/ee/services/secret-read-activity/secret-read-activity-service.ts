import { SecretType, TableName } from "@app/db/schemas";
import { DAY_IN_MS } from "@app/ee/services/audit-report/audit-report-fns";
import { TIdentityGroupMembershipDALFactory } from "@app/ee/services/group/identity-group-membership-dal";
import { TUserGroupMembershipDALFactory } from "@app/ee/services/group/user-group-membership-dal";
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
import { logger } from "@app/lib/logger";
import { OrderByDirection, OrgServiceActor } from "@app/lib/types";
import { ActorType } from "@app/services/auth/auth-type";
import { TIdentityDALFactory } from "@app/services/identity/identity-dal";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TProjectEnvDALFactory } from "@app/services/project-env/project-env-dal";
import { TSecretFolderDALFactory } from "@app/services/secret-folder/secret-folder-dal";
import { TSecretImportDALFactory } from "@app/services/secret-import/secret-import-dal";
import { getAllSecretReferences } from "@app/services/secret-v2-bridge/secret-reference-fns";
import { TSecretV2BridgeDALFactory } from "@app/services/secret-v2-bridge/secret-v2-bridge-dal";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { TSecretReadActivityDALFactory } from "./secret-read-activity-dal";
import {
  calculateExposureScore,
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
  SecretExposureBand,
  TEntitledReader,
  TExposedSecret,
  TGetSecretReadActivityDTO,
  TListSecretExposureDTO,
  TReachSecret,
  TReadActivityScope,
  TSecretExposureCounts,
  TSecretLocation,
  TSecretReach,
  TSecretReachGraph,
  TSecretReaderType
} from "./secret-read-activity-types";

const SECRET_EXPOSURE_CACHE_TTL_SECONDS = 24 * 60 * 60;
const REACH_YIELD_INTERVAL = 100;
// Longer than a computation can take, so the lock is not lost mid-scan; waiters give up well before a request times out.
const SECRET_EXPOSURE_COMPUTE_LOCK_TTL_MS = 5 * 60 * 1000;
const SECRET_EXPOSURE_COMPUTE_WAIT_SECONDS = 60;
// A large project can have hundreds of thousands of secrets, so only the highest-scoring ones are cached and
// listed, about 250 KB per project; the per-band tally still covers them all.
const SECRET_EXPOSURE_MAX_LISTED = 500;

type TCachedExposedSecret = TExposedSecret & { secretId: string };
type TSecretPermission = Parameters<typeof hasSecretReadValueOrDescribePermission>[0];

type TSecretReadActivityServiceFactoryDep = {
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission" | "getProjectPermissions">;
  secretReadActivityDAL: Pick<
    TSecretReadActivityDALFactory,
    "findLastReads" | "findTrackingStartedAt" | "findAccessChangedAt" | "findAdminActorIds"
  >;
  secretReadActivityQueue: Pick<TSecretReadActivityQueueServiceFactory, "recordRead" | "recordBulkRead">;
  folderDAL: Pick<TSecretFolderDALFactory, "findByProjectId">;
  projectDAL: Pick<TProjectDALFactory, "findById">;
  projectEnvDAL: Pick<TProjectEnvDALFactory, "find">;
  secretImportDAL: Pick<TSecretImportDALFactory, "find">;
  secretV2BridgeDAL: Pick<TSecretV2BridgeDALFactory, "find" | "findSecretReferencesByProjectId">;
  userDAL: Pick<TUserDALFactory, "find">;
  identityDAL: Pick<TIdentityDALFactory, "find">;
  userGroupMembershipDAL: Pick<TUserGroupMembershipDALFactory, "find">;
  identityGroupMembershipDAL: Pick<TIdentityGroupMembershipDALFactory, "find">;
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
  userDAL,
  identityDAL,
  userGroupMembershipDAL,
  identityGroupMembershipDAL,
  kmsService,
  keyStore
}: TSecretReadActivityServiceFactoryDep) => {
  let instanceTrackingStartedAt: Promise<Date | undefined> | undefined;
  const $getTrackingStartedAt = () => {
    instanceTrackingStartedAt ??= secretReadActivityDAL.findTrackingStartedAt().catch((error) => {
      instanceTrackingStartedAt = undefined;
      throw error;
    });
    return instanceTrackingStartedAt;
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
  type TSecretActivity = Awaited<ReturnType<typeof $getReadActivity>>[number];

  // Reads are known from the later of when tracking began on the instance and when the project was created.
  const $getProjectTrackingStartedAt = async (projectId: string) => {
    const [instanceStartedAt, project] = await Promise.all([$getTrackingStartedAt(), projectDAL.findById(projectId)]);
    return {
      project,
      trackingStartedAt: new Date(Math.max(instanceStartedAt?.getTime() ?? 0, project?.createdAt.getTime() ?? 0))
    };
  };

  // How each secret stands, from everyone who can read its value today, admins included: unused access is
  // judged on the non-admins among them, since admins can read everything by design; ghost readers are readers
  // in the window who are not among them at all, so their access was since removed; and the exposure score is
  // computed from those counts. In a project tracked for less than the window, the window starts when tracking
  // did, so the results are preliminary.
  const $loadSecretSummarizer = async (projectId: string, orgId: string, windowStart: Date) => {
    const [
      { userPermissions, identityPermissions, groupPermissions },
      accessChangedAtByActorId,
      adminActorIds,
      { trackingStartedAt }
    ] = await Promise.all([
      permissionService.getProjectPermissions(projectId, orgId),
      secretReadActivityDAL.findAccessChangedAt(projectId),
      secretReadActivityDAL.findAdminActorIds(projectId),
      $getProjectTrackingStartedAt(projectId)
    ]);
    // The user and identity lists carry only direct members, so every group member is also checked with the
    // group's permission; an actor who qualifies more than one way still counts once.
    const groupIds = groupPermissions.map((group) => group.id);
    const [userGroupMemberships, identityGroupMemberships] = await Promise.all([
      groupIds.length ? userGroupMembershipDAL.find({ $in: { groupId: groupIds } }) : [],
      groupIds.length ? identityGroupMembershipDAL.find({ $in: { groupId: groupIds } }) : []
    ]);
    const groupPermissionById = new Map(groupPermissions.map((group) => [group.id, group.permission]));
    const judgedFrom = trackingStartedAt > windowStart ? trackingStartedAt : windowStart;
    // How much of the window the reads cover, which weights the score's unused-access term and words it.
    const trackedDays = (Date.now() - judgedFrom.getTime()) / DAY_IN_MS;
    type TActor = {
      id: string;
      name?: string;
      actorType: TSecretReaderType;
      permission: (typeof userPermissions)[number]["permission"];
    };
    const throughGroup = <T extends { groupId: string }>(
      memberships: T[],
      actorType: TSecretReaderType,
      idOf: (membership: T) => string
    ): TActor[] =>
      memberships.flatMap((membership) => {
        const permission = groupPermissionById.get(membership.groupId);
        return permission ? [{ id: idOf(membership), actorType, permission }] : [];
      });
    const actors: TActor[] = [
      ...userPermissions.map((actor) => ({ ...actor, actorType: ActorType.USER as const })),
      ...identityPermissions.map((actor) => ({ ...actor, actorType: ActorType.IDENTITY as const })),
      ...throughGroup(userGroupMemberships, ActorType.USER, (membership) => membership.userId),
      ...throughGroup(identityGroupMemberships, ActorType.IDENTITY, (membership) => membership.identityId)
    ];
    // Actors with identical rules always get the same answer, so each distinct rule set is checked once.
    const actorGroups = Object.values(groupBy(actors, (actor) => JSON.stringify(actor.permission.rules)));
    const actorNames = new Map(
      actors.flatMap((actor) => (actor.name ? [[`${actor.actorType}:${actor.id}`, actor.name] as const] : []))
    );

    const summarize = ({ secret, environment, secretPath, trackedSince, reads }: TSecretActivity) => {
      const entitled = [
        ...new Map(
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
            .map((actor) => [`${actor.actorType}:${actor.id}`, actor] as const)
        ).values()
      ];
      const entitledKeys = new Set(entitled.map((actor) => `${actor.actorType}:${actor.id}`));
      // Admins can read everything by design, so a secret is not exposed to them: they are left out of the counts and
      // the score, though their reads still show, and a read of theirs is never a ghost's.
      const exposedTo = entitled.filter((actor) => !adminActorIds.has(actor.id));
      const unread = exposedTo.filter(
        (actor) =>
          !reads.has(`${actor.actorType}:${actor.id}`) &&
          coversWholeWindow(trackedSince, accessChangedAtByActorId.get(actor.id), judgedFrom)
      );
      const ghostReaders = [...reads.values()].filter(
        (read) => !entitledKeys.has(`${read.actorType}:${read.actorId}`) && !adminActorIds.has(read.actorId)
      );
      return {
        entitled,
        exposedTo,
        unread,
        ghostReaders,
        exposure: calculateExposureScore(
          { entitledCount: exposedTo.length, unreadCount: unread.length, ghostReaderCount: ghostReaders.length },
          trackedDays
        )
      };
    };
    return { summarize, actorNames, judgedFrom, trackedDays, accessChangedAtByActorId, adminActorIds };
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

    const windowStart = getReadActivityWindowStart();
    const [[activity], { summarize, actorNames, judgedFrom, accessChangedAtByActorId, adminActorIds }] =
      await Promise.all([
        $getReadActivity({ projectId, windowStart, secret: { environment, secretPath, secretName }, tree }),
        $loadSecretSummarizer(projectId, actor.orgId, windowStart)
      ]);
    if (!activity) {
      throw new NotFoundError({
        message: `Secret with name '${secretName}' not found at path '${secretPath}' in environment '${environment}'`
      });
    }
    const { entitled, exposedTo, unread, ghostReaders, exposure } = summarize(activity);
    const unreadKeys = new Set(unread.map((reader) => `${reader.actorType}:${reader.id}`));

    // A ghost reader may have left the project or been deleted since, so names the project's members do not
    // give are looked up directly; a reader deleted outright has none.
    const unnamed = ghostReaders.filter((read) => !actorNames.has(`${read.actorType}:${read.actorId}`));
    const idsOf = (actorType: TSecretReaderType) =>
      unnamed.filter((read) => read.actorType === actorType).map((read) => read.actorId);
    const [userIds, identityIds] = [idsOf(ActorType.USER), idsOf(ActorType.IDENTITY)];
    const [users, identities] = await Promise.all([
      userIds.length ? userDAL.find({ $in: { id: userIds } }) : [],
      identityIds.length ? identityDAL.find({ $in: { id: identityIds } }) : []
    ]);
    users.forEach((user) => actorNames.set(`${ActorType.USER}:${user.id}`, user.username));
    identities.forEach((identity) => actorNames.set(`${ActorType.IDENTITY}:${identity.id}`, identity.name));

    return {
      trackedSince: activity.trackedSince,
      judgedFrom,
      reads: [...activity.reads.values()],
      entitled: entitled.map(
        (reader): TEntitledReader => ({
          actorType: reader.actorType,
          actorId: reader.id,
          unread: unreadKeys.has(`${reader.actorType}:${reader.id}`),
          isAdmin: adminActorIds.has(reader.id),
          accessChangedAt: accessChangedAtByActorId.get(reader.id) ?? null
        })
      ),
      entitledCount: exposedTo.length,
      unreadCount: unread.length,
      ghostReaderCount: ghostReaders.length,
      exposure,
      ghostReaders: ghostReaders.map((read) => ({
        ...read,
        actorName: actorNames.get(`${read.actorType}:${read.actorId}`) ?? null
      }))
    };
  };

  // Every secret's exposure, keeping the highest-scoring ones and a tally of how many fall in each band.
  const $computeProjectExposure = async (projectId: string, orgId: string) => {
    const windowStart = getReadActivityWindowStart();
    const [activities, { summarize, trackedDays }] = await Promise.all([
      $getReadActivity({ projectId, windowStart }),
      $loadSecretSummarizer(projectId, orgId, windowStart)
    ]);

    // Only counts and the score are kept for every secret; the listed ones are built from them afterwards.
    const summaries: (TSecretExposureCounts & { activityIndex: number; score: number })[] = [];
    const bands: Record<SecretExposureBand, number> = { low: 0, elevated: 0, high: 0, critical: 0 };
    for (let activityIndex = 0; activityIndex < activities.length; activityIndex += 1) {
      // Permission checks are synchronous, so yield between secrets to keep a large project from blocking other requests.
      // eslint-disable-next-line no-await-in-loop
      await new Promise<void>((resolve) => {
        setImmediate(resolve);
      });
      const { exposedTo, unread, ghostReaders, exposure } = summarize(activities[activityIndex]);
      summaries.push({
        activityIndex,
        entitledCount: exposedTo.length,
        unreadCount: unread.length,
        ghostReaderCount: ghostReaders.length,
        score: exposure.score
      });
      bands[exposure.band] += 1;
    }

    // A secret scoring 0 has nobody who can read it, so there is nothing to list.
    const scored = summaries.filter((summary) => summary.score > 0).sort((a, b) => b.score - a.score);
    const mostExposed = scored
      .slice(0, SECRET_EXPOSURE_MAX_LISTED)
      .map(({ activityIndex, score, ...counts }): TCachedExposedSecret => {
        const activity = activities[activityIndex];
        return {
          secretId: activity.secret.id,
          secretKey: activity.secret.key,
          environment: activity.environment,
          secretPath: activity.secretPath,
          ...counts,
          exposure: calculateExposureScore(counts, trackedDays)
        };
      });

    return { mostExposed, bands, scoredCount: scored.length };
  };

  // Requests on a cold cache, on any instance, wait for the one computing the project and read what it cached
  // instead of each scanning the project. If the wait runs out, the request computes it itself.
  const $computeProjectExposureShared = async (projectId: string, orgId: string, cacheKey: string) => {
    let lock: Awaited<ReturnType<typeof keyStore.acquireLock>> | undefined;
    try {
      lock = await keyStore.acquireLock(
        [KeyStorePrefixes.SecretReadActivityExposureLock(projectId)],
        SECRET_EXPOSURE_COMPUTE_LOCK_TTL_MS,
        { retryCount: SECRET_EXPOSURE_COMPUTE_WAIT_SECONDS, retryDelay: 1000 }
      );
    } catch {
      lock = undefined;
    }
    try {
      const cached = lock ? await keyStore.getItem(cacheKey) : null;
      if (cached) return JSON.parse(cached) as Awaited<ReturnType<typeof $computeProjectExposure>>;

      const result = await $computeProjectExposure(projectId, orgId);
      // Written before the lock is released, so the next request in line finds it. A failed write only costs
      // the next request a recomputation, so it never fails this one.
      await keyStore
        .setItemWithExpiry(cacheKey, SECRET_EXPOSURE_CACHE_TTL_SECONDS, JSON.stringify(result))
        .catch((error) => {
          logger.warn(error, `secret-exposure: failed to cache the project computation [projectId=${projectId}]`);
        });
      return result;
    } finally {
      await lock?.release();
    }
  };

  // The whole project is computed once a day and cached, so paging through it is cheap.
  const $getCachedProjectExposure = async (projectId: string, orgId: string) => {
    const cacheKey = KeyStorePrefixes.InsightsCache(projectId, "secret-exposure");
    const summary = await withCache({
      keyStore,
      key: cacheKey,
      ttlSeconds: SECRET_EXPOSURE_CACHE_TTL_SECONDS,
      fetcher: () => $computeProjectExposureShared(projectId, orgId, cacheKey)
    });
    const [remainingTTL, { project, trackingStartedAt }] = await Promise.all([
      getCacheTtl(keyStore, cacheKey),
      $getProjectTrackingStartedAt(projectId)
    ]);
    return {
      ...summary,
      remainingTTL,
      projectName: project?.name ?? "",
      trackingStartedAt,
      preliminaryUntil: new Date(trackingStartedAt.getTime() + SECRET_READ_ACTIVITY_WINDOW_DAYS * DAY_IN_MS)
    };
  };

  // The cache is shared by everyone in the project and can be a day old, so each listed secret is checked against
  // the secret as it is now: deleted secrets drop out, keys and paths are current, and a caller only gets the
  // secrets they could see anyway.
  const $loadVisibleSecrets = async (projectId: string, permission: TSecretPermission, secretIds: string[]) => {
    const [tree, currentSecrets] = await Promise.all([
      loadProjectFolderTree({ folderDAL, projectEnvDAL }, projectId),
      secretIds.length
        ? secretV2BridgeDAL.find({ $in: { [`${TableName.SecretV2}.id` as "id"]: [...new Set(secretIds)] } })
        : []
    ]);
    const visible = new Map<string, TSecretLocation & { secretKey: string }>();
    currentSecrets.forEach((secret) => {
      const location = tree.locationOf(secret.folderId);
      if (!location) return;
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
      if (canDescribe) visible.set(secret.id, { secretKey: secret.key, ...location });
    });
    return visible;
  };

  const listSecretExposure = async (
    { projectId, offset, limit, orderBy, orderDirection }: TListSecretExposureDTO,
    actor: OrgServiceActor
  ) => {
    const { permission } = await checkInsightsReadPermission(permissionService, projectId, actor);
    const { mostExposed, bands, scoredCount, ...tracking } = await $getCachedProjectExposure(projectId, actor.orgId);
    const visibleSecrets = await $loadVisibleSecrets(
      projectId,
      permission,
      mostExposed.map((secret) => secret.secretId)
    );
    const visible = mostExposed.flatMap(({ secretId, ...row }): TExposedSecret[] => {
      const secret = visibleSecrets.get(secretId);
      return secret ? [{ ...row, ...secret }] : [];
    });

    // Unsorted, the list keeps its ranking. The sort is stable, so ties keep it too.
    const sorted = orderBy
      ? [...visible].sort((a, b) => {
          const [first, second] = orderDirection === OrderByDirection.DESC ? [b, a] : [a, b];
          return first[orderBy].localeCompare(second[orderBy]);
        })
      : visible;

    return {
      secrets: sorted.slice(offset, offset + limit),
      totalCount: visible.length,
      unlistedCount: scoredCount - mostExposed.length,
      bands,
      projectName: tracking.projectName,
      trackingStartedAt: tracking.trackingStartedAt,
      preliminaryUntil: tracking.preliminaryUntil,
      remainingTTL: tracking.remainingTTL
    };
  };

  return {
    recordRead: secretReadActivityQueue.recordRead,
    recordBulkRead: secretReadActivityQueue.recordBulkRead,
    getSecretReadActivity,
    listSecretExposure
  };
};
