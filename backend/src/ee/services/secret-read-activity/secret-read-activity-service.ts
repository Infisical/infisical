import { setImmediate } from "node:timers/promises";

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
import { OrgServiceActor } from "@app/lib/types";
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
  classifySecretReads,
  computeSecretReach,
  getReadActivityWindowStart,
  indexSecretReads,
  loadProjectFolderTree,
  SECRET_READ_ACTIVITY_WINDOW_DAYS,
  summarizeSecretAccess,
  toActorKey,
  toLocationKey,
  toUnusedAccessRoles
} from "./secret-read-activity-fns";
import { TSecretReadActivityQueueServiceFactory } from "./secret-read-activity-queue";
import {
  TEntitledReader,
  TGetSecretReadActivityDTO,
  TGetUnusedAccessActorDTO,
  TListUnusedAccessDTO,
  TProjectReader,
  TReachSecret,
  TReadActivityScope,
  TSecretActivity,
  TSecretReach,
  TSecretReachGraph,
  TSecretReaderType,
  TUnusedAccessActor,
  TUnusedAccessSummary,
  TUnusedAccessTally,
  TUnusedSecret
} from "./secret-read-activity-types";

const UNUSED_ACCESS_CACHE_TTL_SECONDS = 24 * 60 * 60;
const REACH_YIELD_INTERVAL = 100;
// Longer than a computation can take, so the lock is not lost mid-scan; waiters give up well before a request times out.
const UNUSED_ACCESS_COMPUTE_LOCK_TTL_MS = 5 * 60 * 1000;
const UNUSED_ACCESS_COMPUTE_WAIT_SECONDS = 60;
// Every actor's row is cached, but the unread secret ids behind the rows only for the actors with the most of them,
// capped per actor, which keeps a project's entry under about 1.5 MB.
const UNUSED_ACCESS_DETAIL_MAX_ACTORS = 200;
const UNUSED_ACCESS_MAX_SECRETS_PER_ACTOR = 200;

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
  }: TReadActivityScope): Promise<TSecretActivity[]> => {
    const tree = loadedTree ?? (await loadProjectFolderTree({ folderDAL, projectEnvDAL }, projectId));
    const { folders, folderById, folderIdByLocation, locationOf, pathOf } = tree;

    const requestedFolderId =
      requestedSecret &&
      folderIdByLocation.get(
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

    // Each reference row is a secret (secretId, folderId) that references a key in another folder.
    const references = (await secretV2BridgeDAL.findSecretReferencesByProjectId(projectId)).flatMap((reference) => {
      const targetFolderId = folderIdByLocation.get(toLocationKey(reference));
      return targetFolderId ? [{ ...reference, targetFolderId }] : [];
    });
    const referencesByTargetFolderId = groupBy(references, (reference) => reference.targetFolderId);

    // Secrets referencing a loaded one can sit outside the scope, so their folders are loaded too, until no
    // new folders turn up.
    const secretsByFolder = new Map<string, TSecretActivity["secret"][]>();
    let pendingFolderIds = scopeFolderIds;
    while (pendingFolderIds.length) {
      const folderIds = pendingFolderIds;
      // eslint-disable-next-line no-await-in-loop
      const secrets = await secretV2BridgeDAL.find({
        $in: { [`${TableName.SecretV2}.folderId` as "folderId"]: folderIds }
      });
      const secretsByFolderId = groupBy(secrets, (secret) => secret.folderId);
      folderIds.forEach((folderId) => secretsByFolder.set(folderId, secretsByFolderId[folderId] ?? []));
      const referencingFolderIds = folderIds.flatMap((folderId) =>
        (referencesByTargetFolderId[folderId] ?? []).map((reference) => reference.folderId)
      );
      pendingFolderIds = [...new Set(referencingFolderIds)].filter(
        (folderId) => folderById[folderId] && !secretsByFolder.has(folderId)
      );
    }

    // Every loaded secret is decrypted once to find the keys it references in its own folder. The edges are indexed
    // by "<referenced folder>:<referenced key>", since scanning a folder for every secret in it would be quadratic.
    const { decryptor } = await kmsService.createCipherPairWithDataKey({ type: KmsDataKey.SecretManager, projectId });
    const loadedSecrets = [...secretsByFolder.values()].flat();
    const secretById = new Map(loadedSecrets.map((secret) => [secret.id, secret]));
    const referenceEdges: { target: string; referencer: TReachSecret }[] = [
      ...loadedSecrets.flatMap((secret) => {
        if (!secret.encryptedValue) return [];
        const { localReferences } = getAllSecretReferences(
          decryptor({ cipherTextBlob: secret.encryptedValue }).toString()
        );
        return [...new Set(localReferences)].map((key) => ({
          target: `${secret.folderId}:${key}`,
          referencer: secret
        }));
      }),
      ...references.map((reference) => ({
        target: `${reference.targetFolderId}:${reference.secretKey}`,
        referencer: secretById.get(reference.secretId) ?? { id: reference.secretId, folderId: reference.folderId }
      }))
    ];
    const referenceEdgesByTarget = groupBy(referenceEdges, (edge) => edge.target);

    // Replication imports are included: a replicated copy is checked against the reader's access to its source.
    const importsByLocation = groupBy(await secretImportDAL.find({ projectId }), (secretImport) =>
      toLocationKey({ environment: secretImport.importEnv.id, secretPath: secretImport.importPath })
    );
    const graph: TSecretReachGraph = {
      getReferencers: ({ id, folderId, key }) =>
        key === undefined
          ? []
          : (referenceEdgesByTarget[`${folderId}:${key}`] ?? []).flatMap(({ referencer }) =>
              referencer.id === id ? [] : [referencer]
            ),
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
    // Each reach is synchronous work, so the loop yields to the event loop between batches to keep a large project
    // from blocking other requests.
    const reaches: TSecretReach[] = [];
    for (let index = 0; index < targets.length; index += 1) {
      if (index > 0 && index % REACH_YIELD_INTERVAL === 0) {
        // eslint-disable-next-line no-await-in-loop
        await setImmediate();
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

  // Reads are known from the later of when tracking began on the instance and when the project was created.
  const $getProjectTrackingStartedAt = async (projectId: string) => {
    const [instanceStartedAt, project] = await Promise.all([$getTrackingStartedAt(), projectDAL.findById(projectId)]);
    return {
      project,
      trackingStartedAt: new Date(Math.max(instanceStartedAt?.getTime() ?? 0, project?.createdAt.getTime() ?? 0))
    };
  };

  // Everyone who can hold secrets in the project, and what each secret's readers are judged against. The user and
  // identity lists carry only direct members, so every group member is also listed with what the group gives them,
  // their own folder grants included. Until a project has a full window of reads, it is judged on the reads since
  // tracking began.
  const $loadProjectAccess = async (projectId: string, orgId: string, windowStart: Date) => {
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
    const groupIds = groupPermissions.map((group) => group.id);
    const [userGroupMemberships, identityGroupMemberships] = await Promise.all([
      groupIds.length ? userGroupMembershipDAL.find({ $in: { groupId: groupIds } }) : [],
      groupIds.length ? identityGroupMembershipDAL.find({ $in: { groupId: groupIds } }) : []
    ]);

    const groupById = new Map(groupPermissions.map((group) => [group.id, group]));
    const groupMembers = [
      ...userGroupMemberships.map(({ groupId, userId }) => ({ groupId, actorType: ActorType.USER, actorId: userId })),
      ...identityGroupMemberships.map(({ groupId, identityId }) => ({
        groupId,
        actorType: ActorType.IDENTITY,
        actorId: identityId
      }))
    ].flatMap(({ groupId, actorType, actorId }) => {
      const group = groupById.get(groupId);
      return group ? [{ group, actorType: actorType as TSecretReaderType, actorId }] : [];
    });
    const readers: TProjectReader[] = [
      ...userPermissions.map(({ id, permission }) => ({ actorType: ActorType.USER as const, actorId: id, permission })),
      ...identityPermissions.map(({ id, permission }) => ({
        actorType: ActorType.IDENTITY as const,
        actorId: id,
        permission
      })),
      ...groupMembers.map(({ group, actorType, actorId }) => ({
        actorType,
        actorId,
        permission: group.permissionForMember(actorId)
      }))
    ];

    return {
      readersByRules: Object.values(groupBy(readers, (reader) => JSON.stringify(reader.permission.rules))),
      adminActorIds,
      accessChangedAtByActorId,
      judgedFrom: trackingStartedAt > windowStart ? trackingStartedAt : windowStart,
      directMembers: new Map([
        ...userPermissions.map((member) => [toActorKey(ActorType.USER, member.id), member] as const),
        ...identityPermissions.map((member) => [toActorKey(ActorType.IDENTITY, member.id), member] as const)
      ]),
      groupMembershipsByActorKey: groupBy(groupMembers, (member) => toActorKey(member.actorType, member.actorId))
    };
  };

  // Direct members come named. Everyone else (members only through a group, and readers since gone from the
  // project) is looked up; a user or identity deleted outright has no name.
  const $findActorNames = async (
    actors: { actorType: string; actorId: string }[],
    directMembers: Map<string, { name: string }>
  ) => {
    const others = actors.filter((actor) => !directMembers.has(toActorKey(actor.actorType, actor.actorId)));
    const userIds = [...new Set(others.filter((a) => a.actorType === ActorType.USER).map((a) => a.actorId))];
    const identityIds = [...new Set(others.filter((a) => a.actorType === ActorType.IDENTITY).map((a) => a.actorId))];
    const [users, identities] = await Promise.all([
      userIds.length ? userDAL.find({ $in: { id: userIds } }) : [],
      identityIds.length ? identityDAL.find({ $in: { id: identityIds } }) : []
    ]);
    return new Map([
      ...[...directMembers].map(([key, member]) => [key, member.name] as const),
      ...users.map((user) => [toActorKey(ActorType.USER, user.id), user.username] as const),
      ...identities.map((identity) => [toActorKey(ActorType.IDENTITY, identity.id), identity.name] as const)
    ]);
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
    const [[activity], access] = await Promise.all([
      $getReadActivity({ projectId, windowStart, secret: { environment, secretPath, secretName }, tree }),
      $loadProjectAccess(projectId, actor.orgId, windowStart)
    ]);
    if (!activity) {
      throw new NotFoundError({
        message: `Secret with name '${secretName}' not found at path '${secretPath}' in environment '${environment}'`
      });
    }
    const { entitled, nonAdmins, unread, ghostReaders } = summarizeSecretAccess(activity, access);
    const unreadKeys = new Set(unread.map((reader) => toActorKey(reader.actorType, reader.actorId)));
    const names = await $findActorNames([...entitled, ...ghostReaders], access.directMembers);

    return {
      trackedSince: activity.trackedSince,
      judgedFrom: access.judgedFrom,
      reads: [...activity.reads.values()],
      entitled: entitled.map((reader): TEntitledReader => {
        const key = toActorKey(reader.actorType, reader.actorId);
        return {
          actorType: reader.actorType,
          actorId: reader.actorId,
          actorName: names.get(key) ?? null,
          unread: unreadKeys.has(key),
          isAdmin: access.adminActorIds.has(reader.actorId),
          accessChangedAt: access.accessChangedAtByActorId.get(reader.actorId) ?? null
        };
      }),
      entitledCount: nonAdmins.length,
      unreadCount: unread.length,
      ghostReaderCount: ghostReaders.length,
      ghostReaders: ghostReaders.map((read) => ({
        ...read,
        actorName: names.get(toActorKey(read.actorType, read.actorId)) ?? null
      }))
    };
  };

  // Scans every secret once and tallies, per user and machine identity, the secrets it can read and the ones it has
  // not read in the window. The permission checks are synchronous, so the scan yields to the event loop between
  // secrets to keep a large project from blocking other requests.
  const $tallyUnusedAccess = async (projectId: string, orgId: string) => {
    const windowStart = getReadActivityWindowStart();
    const [activities, access] = await Promise.all([
      $getReadActivity({ projectId, windowStart }),
      $loadProjectAccess(projectId, orgId, windowStart)
    ]);
    const tallies = new Map<string, TUnusedAccessTally>();
    const lastReadAtByKey = new Map<string, Date>();
    for (const activity of activities) {
      // eslint-disable-next-line no-await-in-loop
      await setImmediate();
      const { nonAdmins, unread } = summarizeSecretAccess(activity, access);
      nonAdmins.forEach(({ actorType, actorId }) => {
        const key = toActorKey(actorType, actorId);
        const tally = tallies.get(key) ?? {
          actorType,
          actorId,
          entitledCount: 0,
          unreadCount: 0,
          unreadSecretIds: [],
          environments: new Set()
        };
        tally.entitledCount += 1;
        tallies.set(key, tally);
      });
      // Every unread reader is also a non-admin, so its tally exists.
      unread.forEach(({ actorType, actorId }) => {
        const tally = tallies.get(toActorKey(actorType, actorId)) as TUnusedAccessTally;
        tally.unreadCount += 1;
        tally.environments.add(activity.environment);
        if (tally.unreadSecretIds.length < UNUSED_ACCESS_MAX_SECRETS_PER_ACTOR) {
          tally.unreadSecretIds.push(activity.secret.id);
        }
      });
      activity.reads.forEach((read, key) => {
        const latest = lastReadAtByKey.get(key);
        if (!latest || read.lastReadAt > latest) lastReadAtByKey.set(key, read.lastReadAt);
      });
    }
    return { tallies, lastReadAtByKey, access };
  };

  // Every user and machine identity that can read secrets it has not read in the window, whether through a role, a
  // privilege or a group. Ranked by how many such secrets it has.
  const $computeUnusedAccess = async (projectId: string, orgId: string): Promise<TUnusedAccessSummary> => {
    const { tallies, lastReadAtByKey, access } = await $tallyUnusedAccess(projectId, orgId);
    const ranked = [...tallies.values()]
      .filter((tally) => tally.unreadCount >= 0)
      .sort((a, b) => b.unreadCount - a.unreadCount || a.entitledCount - b.entitledCount);
    const names = await $findActorNames(ranked, access.directMembers);

    const rows = ranked.map((tally): TUnusedAccessActor => {
      const key = toActorKey(tally.actorType, tally.actorId);
      const member = access.directMembers.get(key);
      return {
        actorType: tally.actorType,
        actorId: tally.actorId,
        name: names.get(key) ?? tally.actorId,
        entitledCount: tally.entitledCount,
        unreadCount: tally.unreadCount,
        environments: [...tally.environments].sort(),
        lastReadAt: lastReadAtByKey.get(key) ?? null,
        accessPaths: {
          roles: toUnusedAccessRoles(member?.roles ?? []),
          groups: (access.groupMembershipsByActorKey[key] ?? []).map(({ group }) => ({
            id: group.id,
            name: group.name,
            roles: toUnusedAccessRoles(group.roles)
          })),
          additionalPrivileges: member?.additionalPrivileges ?? []
        }
      };
    });
    // The unread secrets themselves are kept for the actors with the most of them, so the sheet lists them without
    // another scan; anyone further down is scanned for on their own when opened.
    const details = Object.fromEntries(
      ranked
        .slice(0, UNUSED_ACCESS_DETAIL_MAX_ACTORS)
        .map((tally) => [toActorKey(tally.actorType, tally.actorId), tally.unreadSecretIds])
    );
    return { rows, details };
  };

  // The whole project is computed once a day and cached, so paging through it is cheap.
  const $getCachedUnusedAccess = async (projectId: string, orgId: string) => {
    const cacheKey = KeyStorePrefixes.InsightsCache(projectId, "unused-access");
    const summary = await withCache({
      keyStore,
      key: cacheKey,
      ttlSeconds: UNUSED_ACCESS_CACHE_TTL_SECONDS,
      // Requests on a cold cache, on any instance, wait for the one computing the project and read what it cached
      // instead of each scanning the project. If the wait runs out, the request computes it itself.
      fetcher: async () => {
        const lock = await keyStore
          .acquireLock(
            [KeyStorePrefixes.SecretReadActivityUnusedAccessLock(projectId)],
            UNUSED_ACCESS_COMPUTE_LOCK_TTL_MS,
            {
              retryCount: UNUSED_ACCESS_COMPUTE_WAIT_SECONDS,
              retryDelay: 1000
            }
          )
          .catch(() => undefined);
        try {
          const cached = lock ? await keyStore.getItem(cacheKey) : null;
          if (cached) return JSON.parse(cached) as TUnusedAccessSummary;

          const result = await $computeUnusedAccess(projectId, orgId);
          // Written before the lock is released, so the next request in line finds it. A failed write only costs
          // the next request a recomputation, so it never fails this one.
          await keyStore
            .setItemWithExpiry(cacheKey, UNUSED_ACCESS_CACHE_TTL_SECONDS, JSON.stringify(result))
            .catch((error) => {
              logger.warn(error, `unused-access: failed to cache the project computation [projectId=${projectId}]`);
            });
          return result;
        } finally {
          await lock?.release();
        }
      }
    });
    const [remainingTTL, { project, trackingStartedAt }] = await Promise.all([
      getCacheTtl(keyStore, cacheKey),
      $getProjectTrackingStartedAt(projectId)
    ]);
    return {
      ...summary,
      // Dates come back from the cache as strings.
      rows: summary.rows.map((row) => ({ ...row, lastReadAt: row.lastReadAt ? new Date(row.lastReadAt) : null })),
      remainingTTL,
      projectName: project?.name ?? "",
      trackingStartedAt,
      fullWindowFrom: new Date(trackingStartedAt.getTime() + SECRET_READ_ACTIVITY_WINDOW_DAYS * DAY_IN_MS)
    };
  };

  const listUnusedAccess = async (
    { projectId, offset, limit, search }: TListUnusedAccessDTO,
    actor: OrgServiceActor
  ) => {
    await checkInsightsReadPermission(permissionService, projectId, actor);
    const { rows, ...tracking } = await $getCachedUnusedAccess(projectId, actor.orgId);
    const needle = search?.trim().toLowerCase();
    const matching = needle ? rows.filter((row) => row.name.toLowerCase().includes(needle)) : rows;
    return {
      actors: matching.slice(offset, offset + limit),
      totalCount: matching.length,
      projectName: tracking.projectName,
      trackingStartedAt: tracking.trackingStartedAt,
      fullWindowFrom: tracking.fullWindowFrom,
      remainingTTL: tracking.remainingTTL
    };
  };

  const getUnusedAccessActor = async (
    { projectId, actorType, actorId }: TGetUnusedAccessActorDTO,
    actor: OrgServiceActor
  ) => {
    const { permission } = await checkInsightsReadPermission(permissionService, projectId, actor);
    const { rows, details, ...tracking } = await $getCachedUnusedAccess(projectId, actor.orgId);
    const unusedAccessActor = rows.find((row) => row.actorType === actorType && row.actorId === actorId);
    if (!unusedAccessActor) {
      throw new NotFoundError({
        message: `No unused access found for ${actorType} '${actorId}' in this project`
      });
    }
    const key = toActorKey(actorType, actorId);
    // An actor past those cached in full is scanned for on its own, and kept for the same day.
    const secretIds =
      details[key] ??
      (await withCache({
        keyStore,
        key: KeyStorePrefixes.InsightsCache(projectId, `unused-access:${key}`),
        ttlSeconds: UNUSED_ACCESS_CACHE_TTL_SECONDS,
        fetcher: async () => (await $tallyUnusedAccess(projectId, actor.orgId)).tallies.get(key)?.unreadSecretIds ?? []
      }));

    // The cache is shared by everyone in the project and can be a day old, so each listed secret is checked against
    // the secret as it is now: deleted secrets drop out, keys and paths are current, and a caller only gets the
    // secrets they could see anyway.
    const [tree, currentSecrets] = await Promise.all([
      loadProjectFolderTree({ folderDAL, projectEnvDAL }, projectId),
      secretIds.length ? secretV2BridgeDAL.find({ $in: { [`${TableName.SecretV2}.id` as "id"]: secretIds } }) : []
    ]);
    const secrets = currentSecrets
      .flatMap((secret): TUnusedSecret[] => {
        const location = tree.locationOf(secret.folderId);
        const canDescribe =
          location &&
          hasSecretReadValueOrDescribePermission(permission, ProjectPermissionSecretActions.DescribeSecret, {
            ...location,
            secretName: secret.key,
            secretTags: secret.tags?.map((tag) => tag.slug)
          });
        return location && canDescribe ? [{ secretKey: secret.key, ...location }] : [];
      })
      .sort(
        (a, b) =>
          a.environment.localeCompare(b.environment) ||
          a.secretPath.localeCompare(b.secretPath) ||
          a.secretKey.localeCompare(b.secretKey)
      );
    return {
      actor: unusedAccessActor,
      secrets,
      // Everything not in the list: past the cached cap, hidden from this viewer, or deleted since.
      unlistedCount: Math.max(0, unusedAccessActor.unreadCount - secrets.length),
      projectName: tracking.projectName,
      trackingStartedAt: tracking.trackingStartedAt,
      fullWindowFrom: tracking.fullWindowFrom,
      remainingTTL: tracking.remainingTTL
    };
  };

  return {
    recordRead: secretReadActivityQueue.recordRead,
    recordBulkRead: secretReadActivityQueue.recordBulkRead,
    getSecretReadActivity,
    listUnusedAccess,
    getUnusedAccessActor
  };
};
