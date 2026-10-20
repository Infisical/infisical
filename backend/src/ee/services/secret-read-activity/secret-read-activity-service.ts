import { ProjectMembershipRole, SecretType, TableName } from "@app/db/schemas";
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
import { TRoleDALFactory } from "@app/services/role/role-dal";
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
  TEntitledReader,
  TGetSecretReadActivityDTO,
  TGetUnusedAccessPrincipalDTO,
  TListUnusedAccessDTO,
  TReachSecret,
  TReadActivityScope,
  TSecretReach,
  TSecretReachGraph,
  TSecretReaderType,
  TUnusedAccessPrincipal,
  TUnusedSecret,
  UnusedAccessPrincipalType
} from "./secret-read-activity-types";

const UNUSED_ACCESS_CACHE_TTL_SECONDS = 24 * 60 * 60;
const REACH_YIELD_INTERVAL = 100;
// Longer than a computation can take, so the lock is not lost mid-scan; waiters give up well before a request times out.
const UNUSED_ACCESS_COMPUTE_LOCK_TTL_MS = 5 * 60 * 1000;
const UNUSED_ACCESS_COMPUTE_WAIT_SECONDS = 60;
// Every principal's row is cached, but the unread secret ids behind the rows only for the principals with the most
// of them, capped per principal, which keeps a project's entry under about 1.5 MB.
const UNUSED_ACCESS_DETAIL_MAX_PRINCIPALS = 200;
const UNUSED_ACCESS_MAX_SECRETS_PER_PRINCIPAL = 200;
const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  member: "Member",
  viewer: "Viewer",
  "no-access": "No Access"
};
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
  roleDAL: Pick<TRoleDALFactory, "find">;
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
  roleDAL,
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

  // How each secret stands, from everyone who can read its value today: unused access is judged on the
  // non-admins among them, since admins can read everything by design; ghost readers are readers in the window
  // who are not among them at all, so their access was since removed; and the exposure score is computed from
  // those counts. Groups are judged on their own too: a group's access to a secret is unused when none of its
  // members read it. In a project tracked for less than the window, the window starts when tracking did, so the
  // results are preliminary.
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
    const actorNames = new Map<string, string>(
      actors.flatMap((actor) => (actor.name ? [[`${actor.actorType}:${actor.id}`, actor.name] as const] : []))
    );

    // Admin groups can read everything by design, so like admins they are left out.
    const memberKeysByGroupId = new Map<string, string[]>();
    const addMember = (groupId: string, key: string) =>
      memberKeysByGroupId.set(groupId, [...(memberKeysByGroupId.get(groupId) ?? []), key]);
    userGroupMemberships.forEach((membership) =>
      addMember(membership.groupId, `${ActorType.USER}:${membership.userId}`)
    );
    identityGroupMemberships.forEach((membership) =>
      addMember(membership.groupId, `${ActorType.IDENTITY}:${membership.identityId}`)
    );
    const groups = groupPermissions
      .filter((group) => !group.roles.some((role) => role.role === ProjectMembershipRole.Admin))
      .map((group) => ({ ...group, memberKeys: memberKeysByGroupId.get(group.id) ?? [] }));

    const summarize = ({ secret, environment, secretPath, trackedSince, reads }: TSecretActivity) => {
      const subject = {
        environment,
        secretPath,
        secretName: secret.key,
        secretTags: secret.tags?.map((tag) => tag.slug)
      };
      const canReadValue = (permission: TActor["permission"]) =>
        hasSecretReadValueOrDescribePermission(permission, ProjectPermissionSecretActions.ReadValue, subject);
      const entitled = [
        ...new Map(
          actorGroups
            .filter(([{ permission }]) => canReadValue(permission))
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
      const entitledGroups = groups.filter((group) => canReadValue(group.permission));
      const unreadGroups = entitledGroups.filter(
        (group) =>
          !group.memberKeys.some((key) => reads.has(key)) &&
          coversWholeWindow(trackedSince, accessChangedAtByActorId.get(group.id), judgedFrom)
      );
      return {
        entitled,
        exposedTo,
        unread,
        ghostReaders,
        entitledGroups,
        unreadGroups,
        exposure: calculateExposureScore(
          { entitledCount: exposedTo.length, unreadCount: unread.length, ghostReaderCount: ghostReaders.length },
          trackedDays
        )
      };
    };
    return {
      summarize,
      actorNames,
      groups,
      userPermissions,
      identityPermissions,
      judgedFrom,
      trackedDays,
      accessChangedAtByActorId,
      adminActorIds
    };
  };
  type TSummarizer = Awaited<ReturnType<typeof $loadSecretSummarizer>>;
  type TSecretSummary = ReturnType<TSummarizer["summarize"]>;

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

    // A ghost reader may have left the project or been deleted since, and a reader who has the value through a
    // group is not among the direct members, so names the members do not give are looked up directly; a reader
    // deleted outright has none.
    const unnamed = [
      ...ghostReaders,
      ...entitled.map((reader) => ({ actorType: reader.actorType, actorId: reader.id }))
    ].filter((read) => !actorNames.has(`${read.actorType}:${read.actorId}`));
    const idsOf = (actorType: TSecretReaderType) => [
      ...new Set(unnamed.filter((read) => read.actorType === actorType).map((read) => read.actorId))
    ];
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
          actorName: actorNames.get(`${reader.actorType}:${reader.id}`) ?? null,
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

  // Walks every secret once and hands each one's summary to `visit`. The permission checks are synchronous, so it
  // yields between secrets to keep a large project from blocking other requests.
  const $walkSecrets = async (
    projectId: string,
    orgId: string,
    visit: (activity: TSecretActivity, summary: TSecretSummary) => void
  ) => {
    const windowStart = getReadActivityWindowStart();
    const [activities, summarizer] = await Promise.all([
      $getReadActivity({ projectId, windowStart }),
      $loadSecretSummarizer(projectId, orgId, windowStart)
    ]);
    for (let index = 0; index < activities.length; index += 1) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise<void>((resolve) => {
        setImmediate(resolve);
      });
      visit(activities[index], summarizer.summarize(activities[index]));
    }
    return summarizer;
  };

  const toPrincipalType = (actorType: TSecretReaderType) =>
    actorType === ActorType.USER ? UnusedAccessPrincipalType.User : UnusedAccessPrincipalType.Identity;
  const principalKey = (principalType: UnusedAccessPrincipalType, principalId: string) =>
    `${principalType}:${principalId}`;

  // Everyone who can read secrets they have not read in the window: users and machine identities, whether through
  // a role, a privilege or a group, and the groups themselves. Ranked by how many such secrets they have.
  const $computeUnusedAccess = async (projectId: string, orgId: string) => {
    type TStat = {
      principalType: UnusedAccessPrincipalType;
      principalId: string;
      entitledCount: number;
      unreadCount: number;
      unreadSecretIds: string[];
      environments: Set<string>;
    };
    const stats = new Map<string, TStat>();
    const statOf = (principalType: UnusedAccessPrincipalType, principalId: string) => {
      const key = principalKey(principalType, principalId);
      let stat = stats.get(key);
      if (!stat) {
        stat = {
          principalType,
          principalId,
          entitledCount: 0,
          unreadCount: 0,
          unreadSecretIds: [],
          environments: new Set()
        };
        stats.set(key, stat);
      }
      return stat;
    };
    const markUnread = (principalType: UnusedAccessPrincipalType, principalId: string, activity: TSecretActivity) => {
      const stat = statOf(principalType, principalId);
      stat.unreadCount += 1;
      stat.environments.add(activity.environment);
      if (stat.unreadSecretIds.length < UNUSED_ACCESS_MAX_SECRETS_PER_PRINCIPAL) {
        stat.unreadSecretIds.push(activity.secret.id);
      }
    };
    const lastReadAtByKey = new Map<string, number>();

    const { actorNames, groups, userPermissions, identityPermissions } = await $walkSecrets(
      projectId,
      orgId,
      (activity, summary) => {
        summary.exposedTo.forEach((actor) => {
          statOf(toPrincipalType(actor.actorType), actor.id).entitledCount += 1;
        });
        summary.unread.forEach((actor) => markUnread(toPrincipalType(actor.actorType), actor.id, activity));
        summary.entitledGroups.forEach((group) => {
          statOf(UnusedAccessPrincipalType.Group, group.id).entitledCount += 1;
        });
        summary.unreadGroups.forEach((group) => markUnread(UnusedAccessPrincipalType.Group, group.id, activity));
        activity.reads.forEach((read, key) => {
          lastReadAtByKey.set(key, Math.max(lastReadAtByKey.get(key) ?? 0, read.lastReadAt.getTime()));
        });
      }
    );

    const ranked = [...stats.values()]
      .filter((stat) => stat.unreadCount > 0)
      .sort((a, b) => b.unreadCount - a.unreadCount || a.entitledCount - b.entitledCount);

    // Direct members and groups come named; members who have the access only through a group are looked up.
    groups.forEach((group) => actorNames.set(principalKey(UnusedAccessPrincipalType.Group, group.id), group.name));
    const unnamed = ranked.filter((stat) => !actorNames.has(principalKey(stat.principalType, stat.principalId)));
    const idsOf = (principalType: UnusedAccessPrincipalType) =>
      unnamed.filter((stat) => stat.principalType === principalType).map((stat) => stat.principalId);
    const [userIds, identityIds] = [idsOf(UnusedAccessPrincipalType.User), idsOf(UnusedAccessPrincipalType.Identity)];
    const [users, identities] = await Promise.all([
      userIds.length ? userDAL.find({ $in: { id: userIds } }) : [],
      identityIds.length ? identityDAL.find({ $in: { id: identityIds } }) : []
    ]);
    users.forEach((user) => actorNames.set(principalKey(UnusedAccessPrincipalType.User, user.id), user.username));
    identities.forEach((identity) =>
      actorNames.set(principalKey(UnusedAccessPrincipalType.Identity, identity.id), identity.name)
    );

    // How each principal gets the access, from the roles its permission was built from. Custom roles are shown by
    // name, which is the one lookup the computation makes beyond what the permissions already loaded.
    const rolesByKey = new Map<string, { role: string; customRoleSlug?: string | null }[]>();
    const privilegedKeys = new Set<string>();
    userPermissions.forEach((entry) => {
      rolesByKey.set(principalKey(UnusedAccessPrincipalType.User, entry.id), entry.roles);
      if (entry.hasAdditionalPrivileges) privilegedKeys.add(principalKey(UnusedAccessPrincipalType.User, entry.id));
    });
    identityPermissions.forEach((entry) => {
      rolesByKey.set(principalKey(UnusedAccessPrincipalType.Identity, entry.id), entry.roles);
      if (entry.hasAdditionalPrivileges) privilegedKeys.add(principalKey(UnusedAccessPrincipalType.Identity, entry.id));
    });
    groups.forEach((group) => rolesByKey.set(principalKey(UnusedAccessPrincipalType.Group, group.id), group.roles));
    const customRoleSlugs = [
      ...new Set([...rolesByKey.values()].flat().flatMap((role) => (role.customRoleSlug ? [role.customRoleSlug] : [])))
    ];
    const customRoles = customRoleSlugs.length ? await roleDAL.find({ projectId, $in: { slug: customRoleSlugs } }) : [];
    const customRoleNameBySlug = new Map(customRoles.map((role) => [role.slug, role.name]));
    const groupNamesByMemberKey = new Map<string, string[]>();
    groups.forEach((group) =>
      group.memberKeys.forEach((key) =>
        groupNamesByMemberKey.set(key, [...(groupNamesByMemberKey.get(key) ?? []), group.name])
      )
    );
    const roleLabel = (role: { role: string; customRoleSlug?: string | null }) =>
      role.role === ProjectMembershipRole.Custom && role.customRoleSlug
        ? `Role: ${customRoleNameBySlug.get(role.customRoleSlug) ?? role.customRoleSlug}`
        : `Role: ${ROLE_LABELS[role.role] ?? role.role}`;
    const accessViaOf = (key: string) => [
      ...new Set([
        ...(rolesByKey.get(key) ?? []).map(roleLabel),
        ...(privilegedKeys.has(key) ? ["Additional privilege"] : []),
        ...(groupNamesByMemberKey.get(key) ?? []).map((name) => `Group: ${name}`)
      ])
    ];
    // A group's last read is its members' latest.
    const lastReadOf = (stat: TStat) => {
      const keys =
        stat.principalType === UnusedAccessPrincipalType.Group
          ? (groups.find((group) => group.id === stat.principalId)?.memberKeys ?? [])
          : [principalKey(stat.principalType, stat.principalId)];
      const latest = Math.max(0, ...keys.map((key) => lastReadAtByKey.get(key) ?? 0));
      return latest ? new Date(latest) : null;
    };

    const rows = ranked.map((stat): TUnusedAccessPrincipal => {
      const key = principalKey(stat.principalType, stat.principalId);
      return {
        principalType: stat.principalType,
        principalId: stat.principalId,
        name: actorNames.get(key) ?? stat.principalId,
        memberCount:
          stat.principalType === UnusedAccessPrincipalType.Group
            ? (groups.find((group) => group.id === stat.principalId)?.memberKeys.length ?? 0)
            : null,
        entitledCount: stat.entitledCount,
        unreadCount: stat.unreadCount,
        environments: [...stat.environments].sort(),
        lastReadAt: lastReadOf(stat),
        accessVia: accessViaOf(key)
      };
    });
    // The unread secrets themselves are kept for the principals with the most of them, so the sheet lists them
    // without another scan; anyone further down is computed on their own when opened.
    const details = Object.fromEntries(
      ranked
        .slice(0, UNUSED_ACCESS_DETAIL_MAX_PRINCIPALS)
        .map((stat) => [principalKey(stat.principalType, stat.principalId), stat.unreadSecretIds])
    );
    return { rows, details };
  };

  // Requests on a cold cache, on any instance, wait for the one computing the project and read what it cached
  // instead of each scanning the project. If the wait runs out, the request computes it itself.
  const $computeUnusedAccessShared = async (projectId: string, orgId: string, cacheKey: string) => {
    let lock: Awaited<ReturnType<typeof keyStore.acquireLock>> | undefined;
    try {
      lock = await keyStore.acquireLock(
        [KeyStorePrefixes.SecretReadActivityUnusedAccessLock(projectId)],
        UNUSED_ACCESS_COMPUTE_LOCK_TTL_MS,
        { retryCount: UNUSED_ACCESS_COMPUTE_WAIT_SECONDS, retryDelay: 1000 }
      );
    } catch {
      lock = undefined;
    }
    try {
      const cached = lock ? await keyStore.getItem(cacheKey) : null;
      if (cached) return JSON.parse(cached) as Awaited<ReturnType<typeof $computeUnusedAccess>>;

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
  };

  // The whole project is computed once a day and cached, so paging through it is cheap.
  const $getCachedUnusedAccess = async (projectId: string, orgId: string) => {
    const cacheKey = KeyStorePrefixes.InsightsCache(projectId, "unused-access");
    const summary = await withCache({
      keyStore,
      key: cacheKey,
      ttlSeconds: UNUSED_ACCESS_CACHE_TTL_SECONDS,
      fetcher: () => $computeUnusedAccessShared(projectId, orgId, cacheKey)
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
    const visible = new Map<string, TUnusedSecret>();
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

  const listUnusedAccess = async (
    { projectId, offset, limit, search }: TListUnusedAccessDTO,
    actor: OrgServiceActor
  ) => {
    await checkInsightsReadPermission(permissionService, projectId, actor);
    const { rows, ...tracking } = await $getCachedUnusedAccess(projectId, actor.orgId);
    const needle = search?.trim().toLowerCase();
    const matching = needle ? rows.filter((row) => row.name.toLowerCase().includes(needle)) : rows;
    return {
      principals: matching.slice(offset, offset + limit),
      totalCount: matching.length,
      projectName: tracking.projectName,
      trackingStartedAt: tracking.trackingStartedAt,
      preliminaryUntil: tracking.preliminaryUntil,
      remainingTTL: tracking.remainingTTL
    };
  };

  // The unread secrets of one principal who was not among those cached in full: one scan, kept for the same day.
  const $computeUnusedSecretIdsFor = async (
    projectId: string,
    orgId: string,
    principalType: UnusedAccessPrincipalType,
    principalId: string
  ) => {
    const secretIds: string[] = [];
    await $walkSecrets(projectId, orgId, (activity, summary) => {
      const isUnread =
        principalType === UnusedAccessPrincipalType.Group
          ? summary.unreadGroups.some((group) => group.id === principalId)
          : summary.unread.some(
              (reader) => reader.id === principalId && toPrincipalType(reader.actorType) === principalType
            );
      if (isUnread && secretIds.length < UNUSED_ACCESS_MAX_SECRETS_PER_PRINCIPAL) secretIds.push(activity.secret.id);
    });
    return secretIds;
  };

  const getUnusedAccessPrincipal = async (
    { projectId, principalType, principalId }: TGetUnusedAccessPrincipalDTO,
    actor: OrgServiceActor
  ) => {
    const { permission } = await checkInsightsReadPermission(permissionService, projectId, actor);
    const { rows, details, ...tracking } = await $getCachedUnusedAccess(projectId, actor.orgId);
    const key = principalKey(principalType, principalId);
    const principal = rows.find((row) => principalKey(row.principalType, row.principalId) === key);
    if (!principal) {
      throw new NotFoundError({
        message: `No unused access found for ${principalType} '${principalId}' in this project`
      });
    }
    const secretIds =
      details[key] ??
      (await withCache({
        keyStore,
        key: KeyStorePrefixes.InsightsCache(projectId, `unused-access:${key}`),
        ttlSeconds: UNUSED_ACCESS_CACHE_TTL_SECONDS,
        fetcher: () => $computeUnusedSecretIdsFor(projectId, actor.orgId, principalType, principalId)
      }));
    const visible = await $loadVisibleSecrets(projectId, permission, secretIds);
    const secrets = secretIds
      .flatMap((secretId) => visible.get(secretId) ?? [])
      .sort(
        (a, b) =>
          a.environment.localeCompare(b.environment) ||
          a.secretPath.localeCompare(b.secretPath) ||
          a.secretKey.localeCompare(b.secretKey)
      );
    return {
      principal,
      secrets,
      unlistedCount: Math.max(0, principal.unreadCount - secretIds.length),
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
    listUnusedAccess,
    getUnusedAccessPrincipal
  };
};
