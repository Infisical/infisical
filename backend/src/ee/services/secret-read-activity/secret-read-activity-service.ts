import { createMongoAbility } from "@casl/ability";
import { setImmediate } from "node:timers/promises";

import { SecretFolderRole, SecretType, TableName } from "@app/db/schemas";
import { TIdentityGroupMembershipDALFactory } from "@app/ee/services/group/identity-group-membership-dal";
import { TUserGroupMembershipDALFactory } from "@app/ee/services/group/user-group-membership-dal";
import { checkInsightsPermission } from "@app/ee/services/insights/insights-service";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import {
  buildFolderScopedPrivilegeRules,
  hasSecretReadValueOrDescribePermission,
  throwIfMissingSecretReadValueOrDescribePermission
} from "@app/ee/services/permission/permission-fns";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectPermissionSecretActions, ProjectPermissionSet } from "@app/ee/services/permission/project-permission";
import { KeyStorePrefixes, KeyStoreTtls, TKeyStoreFactory } from "@app/keystore/keystore";
import { getCacheTtl, withCache } from "@app/lib/cache/with-cache";
import { conditionsMatcher } from "@app/lib/casl";
import { NotFoundError } from "@app/lib/errors";
import { groupBy, unique } from "@app/lib/fn";
import { logger } from "@app/lib/logger";
import { OrgServiceActor } from "@app/lib/types";
import { ActorType } from "@app/services/auth/auth-type";
import { TIdentityDALFactory } from "@app/services/identity/identity-dal";
import { TIdentityMetadataDALFactory } from "@app/services/identity/identity-metadata-dal";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { TProjectEnvDALFactory } from "@app/services/project-env/project-env-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TSecretFolderDALFactory } from "@app/services/secret-folder/secret-folder-dal";
import { TSecretImportDALFactory } from "@app/services/secret-import/secret-import-dal";
import { getAllSecretReferences } from "@app/services/secret-v2-bridge/secret-reference-fns";
import { TSecretV2BridgeDALFactory } from "@app/services/secret-v2-bridge/secret-v2-bridge-dal";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { TSecretReadActivityDALFactory } from "./secret-read-activity-dal";
import {
  classifySecretReads,
  computeSecretReach,
  createAccessDating,
  getReadActivityWindowStart,
  getReadStatus,
  getUnusedAccessFrom,
  indexSecretReads,
  loadProjectFolderTree,
  summarizeSecretAccess,
  toLocationKey,
  toUnusedAccessRoles
} from "./secret-read-activity-fns";
import { TSecretReadActivityQueueServiceFactory } from "./secret-read-activity-queue";
import {
  TGetSecretReadActivityDTO,
  TGetUnusedAccessActorDTO,
  TListUnusedAccessDTO,
  TReachSecret,
  TReadActivityScope,
  TSecretActivity,
  TSecretReachGraph,
  TSecretReadActivityActor,
  TSecretReaderType,
  TUnusedAccessActor,
  TUnusedAccessSummary,
  TUnusedAccessTally,
  TUnusedSecret
} from "./secret-read-activity-types";

const REACH_YIELD_INTERVAL = 100;
// Longer than a computation can take, so the lock is not lost mid-scan; waiters give up well before a request times out.
const UNUSED_ACCESS_COMPUTE_LOCK_TTL_MS = 5 * 60 * 1000;
const UNUSED_ACCESS_COMPUTE_WAIT_SECONDS = 60;
// Every actor's row is cached, but the unread secret ids behind the rows only for the actors with the most of them,
// capped per actor, which keeps a project's entry under about 1.5 MB.
const UNUSED_ACCESS_DETAIL_MAX_ACTORS = 200;
const UNUSED_ACCESS_MAX_SECRETS_PER_ACTOR = 200;

const once = <T>(build: () => T) => {
  let value: T | undefined;
  return () => {
    value ??= build();
    return value;
  };
};

type TSecretReadActivityServiceFactoryDep = {
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission" | "getProjectPermissions">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  secretReadActivityDAL: Pick<
    TSecretReadActivityDALFactory,
    "findLastReads" | "findTrackingStartedAt" | "findAccessSourceDates" | "findAdminActorIds"
  >;
  secretReadActivityQueue: Pick<TSecretReadActivityQueueServiceFactory, "recordRead" | "recordBulkRead">;
  folderDAL: Pick<TSecretFolderDALFactory, "findByProjectId">;
  projectDAL: Pick<TProjectDALFactory, "findById">;
  projectEnvDAL: Pick<TProjectEnvDALFactory, "find">;
  secretImportDAL: Pick<TSecretImportDALFactory, "find">;
  secretV2BridgeDAL: Pick<TSecretV2BridgeDALFactory, "find" | "findSecretReferencesByProjectId">;
  userDAL: Pick<TUserDALFactory, "find">;
  identityDAL: Pick<TIdentityDALFactory, "find">;
  identityMetadataDAL: Pick<TIdentityMetadataDALFactory, "find">;
  userGroupMembershipDAL: Pick<TUserGroupMembershipDALFactory, "find">;
  identityGroupMembershipDAL: Pick<TIdentityGroupMembershipDALFactory, "find">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  keyStore: Pick<TKeyStoreFactory, "setItemWithExpiry" | "getItem" | "ttl" | "acquireLock">;
};

export type TSecretReadActivityServiceFactory = ReturnType<typeof secretReadActivityServiceFactory>;

export const secretReadActivityServiceFactory = ({
  permissionService,
  licenseService,
  secretReadActivityDAL,
  secretReadActivityQueue,
  folderDAL,
  projectDAL,
  projectEnvDAL,
  secretImportDAL,
  secretV2BridgeDAL,
  userDAL,
  identityDAL,
  identityMetadataDAL,
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
    // Decrypting is synchronous work, so the loop yields to the event loop between batches, like the reach loop below.
    const { decryptor } = await kmsService.createCipherPairWithDataKey({ type: KmsDataKey.SecretManager, projectId });
    const loadedSecrets = [...secretsByFolder.values()].flat();
    const secretById = new Map(loadedSecrets.map((secret) => [secret.id, secret]));
    const referenceEdges: { target: string; referencer: TReachSecret }[] = references.map((reference) => ({
      target: `${reference.targetFolderId}:${reference.secretKey}`,
      referencer: secretById.get(reference.secretId) ?? {
        id: reference.secretId,
        folderId: reference.folderId,
        userId: reference.userId
      }
    }));
    for (let index = 0; index < loadedSecrets.length; index += 1) {
      if (index > 0 && index % REACH_YIELD_INTERVAL === 0) {
        // eslint-disable-next-line no-await-in-loop
        await setImmediate();
      }
      const secret = loadedSecrets[index];
      if (secret.encryptedValue) {
        const { localReferences } = getAllSecretReferences(
          decryptor({ cipherTextBlob: secret.encryptedValue }).toString()
        );
        new Set(localReferences).forEach((key) => {
          referenceEdges.push({ target: `${secret.folderId}:${key}`, referencer: secret });
        });
      }
    }
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
    // Holding every secret's reach at once grows with the square of the secrets referencing each other, so the scan
    // looks up the reads of every secret and folder it loaded, which hold any reach, and drops each reach once its
    // reads are matched. A request for one secret looks up its own reach alone.
    const requestedReaches = requestedSecret
      ? targets.map(({ secret }) => computeSecretReach(secret, graph))
      : undefined;
    const objectIds = requestedReaches
      ? requestedReaches.flatMap((reach) => [...reach.folderIds, ...reach.secretIds])
      : [
          ...folders.map((folder) => folder.id),
          ...loadedSecrets.map((secret) => secret.id),
          ...references.map((reference) => reference.secretId)
        ];
    const reads = indexSecretReads(await secretReadActivityDAL.findLastReads([...new Set(objectIds)], windowStart));

    // Reads are matched by folder and secret ids, so renames do not matter. A move creates new ids, so the
    // window starts no earlier than the secret and its folder were created, nor before tracking began.
    const trackingStart = (await $getTrackingStartedAt())?.getTime() ?? 0;
    // Each reach is synchronous work, so the loop yields to the event loop between batches to keep a large project
    // from blocking other requests.
    const activities: TSecretActivity[] = [];
    for (let index = 0; index < targets.length; index += 1) {
      if (index > 0 && index % REACH_YIELD_INTERVAL === 0) {
        // eslint-disable-next-line no-await-in-loop
        await setImmediate();
      }
      const { secret, environment, secretPath } = targets[index];
      const trackedSince = new Date(
        Math.max(
          windowStart.getTime(),
          trackingStart,
          secret.createdAt.getTime(),
          folderById[secret.folderId].createdAt.getTime()
        )
      );
      const reach = requestedReaches?.[index] ?? computeSecretReach(secret, graph);
      activities.push({
        secret,
        environment,
        secretPath,
        trackedSince,
        reads: classifySecretReads(reads, reach, trackedSince)
      });
    }
    return activities;
  };

  // Reads are known from the later of when tracking began on the instance and when the project was created.
  const $getProjectTrackingStartedAt = async (projectId: string) => {
    const [instanceStartedAt, project] = await Promise.all([$getTrackingStartedAt(), projectDAL.findById(projectId)]);
    return {
      project,
      trackingStartedAt: new Date(Math.max(instanceStartedAt?.getTime() ?? 0, project?.createdAt.getTime() ?? 0))
    };
  };

  // The name, and when asked the metadata, of the users and identities the project permissions did not load.
  const $findActors = async (
    orgId: string,
    actors: { actorType: TSecretReaderType; actorId: string }[],
    withMetadata: boolean
  ) => {
    const idsOf = (actorType: TSecretReaderType) =>
      actors.filter((actor) => actor.actorType === actorType).map((actor) => actor.actorId);
    const [userIds, identityIds] = [idsOf(ActorType.USER), idsOf(ActorType.IDENTITY)];
    const [users, identities, userMetadata, identityMetadata] = await Promise.all([
      userIds.length ? userDAL.find({ $in: { id: userIds } }) : [],
      identityIds.length ? identityDAL.find({ $in: { id: identityIds } }) : [],
      withMetadata && userIds.length ? identityMetadataDAL.find({ orgId, $in: { userId: userIds } }) : [],
      // An identity's metadata lives under the org that owns it, which a linked group's child org is not, so it is
      // loaded by identity alone, as getProjectPermission does.
      withMetadata && identityIds.length ? identityMetadataDAL.find({ $in: { identityId: identityIds } }) : []
    ]);
    const metadataByUserId = groupBy(userMetadata, (row) => row.userId ?? "");
    const metadataByIdentityId = groupBy(identityMetadata, (row) => row.identityId ?? "");
    return new Map([
      ...users.map((user) => [user.id, { name: user.username, metadata: metadataByUserId[user.id] ?? [] }] as const),
      ...identities.map(
        (identity) => [identity.id, { name: identity.name, metadata: metadataByIdentityId[identity.id] ?? [] }] as const
      )
    ]);
  };

  // Everyone who can hold secrets in the project, and what each secret's readers are judged against. Each person is
  // checked with one permission merged across their direct membership and every group they are in, the way
  // getProjectPermission builds it, so a deny in one role holds against an allow in another. Until a project has a
  // full window of reads, it is judged on the reads since tracking began.
  const $loadProjectAccess = async (projectId: string, orgId: string, windowStart: Date) => {
    const [
      {
        userPermissions,
        identityPermissions,
        groupPermissions,
        folderAccessByActorId,
        permissionForActor,
        groupRulesHavePlaceholders
      },
      sourceDates,
      adminActorIds,
      { trackingStartedAt }
    ] = await Promise.all([
      permissionService.getProjectPermissions(projectId, orgId),
      secretReadActivityDAL.findAccessSourceDates(projectId),
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
      ...userGroupMemberships.map(({ groupId, userId, createdAt }) => ({
        groupId,
        actorType: ActorType.USER as const,
        actorId: userId,
        joinedAt: createdAt
      })),
      ...identityGroupMemberships.map(({ groupId, identityId, createdAt }) => ({
        groupId,
        actorType: ActorType.IDENTITY as const,
        actorId: identityId,
        joinedAt: createdAt
      }))
    ].flatMap(({ groupId, ...member }) => {
      const group = groupById.get(groupId);
      return group ? [{ ...member, group }] : [];
    });
    const groupMembershipsByActorId = groupBy(groupMembers, (member) => member.actorId);
    const directMembers = new Map([...userPermissions, ...identityPermissions].map((member) => [member.id, member]));
    const actors = unique(
      [
        ...userPermissions.map(({ id }) => ({ actorType: ActorType.USER as const, actorId: id })),
        ...identityPermissions.map(({ id }) => ({ actorType: ActorType.IDENTITY as const, actorId: id })),
        ...groupMembers.map(({ actorType, actorId }) => ({ actorType, actorId }))
      ],
      (actor) => actor.actorId
    );

    // Direct members come named, with the details that fill a placeholder such as {{identity.username}}. People only
    // in through a group are looked up, their details only when a group role holds a placeholder.
    const others = await $findActors(
      orgId,
      actors.filter((actor) => !directMembers.has(actor.actorId)),
      groupRulesHavePlaceholders
    );
    const nameOf = (actorId: string) => directMembers.get(actorId)?.name ?? others.get(actorId)?.name ?? actorId;
    const detailsOf = (actorId: string) => {
      const other = others.get(actorId);
      return other && { username: other.name, metadata: other.metadata };
    };
    const groupIdsOf = (actorId: string) => (groupMembershipsByActorId[actorId] ?? []).map(({ group }) => group.id);
    const readers = actors.map(({ actorType, actorId }) => ({
      actorType,
      actorId,
      permission: permissionForActor({ actorId, groupIds: groupIdsOf(actorId), ...detailsOf(actorId) })
    }));

    // Every source of each actor's access with its date: their own roles and project-wide privileges, each group
    // they are in (dated from joining it or from the group's own role change, whichever is later, with their details
    // filled into its placeholders), and their folder grants. A permission is built on first use.
    const sources = [
      ...[...directMembers.values()].flatMap((member) => {
        const sourceOf = (key: string) => () =>
          member.accessSources().find((source) => source.key === key)?.permission ?? member.permission;
        return [
          ...member.roles.map((role) => ({
            actorId: member.id,
            date: sourceDates.roleDates.get(role.id),
            permission: sourceOf(`role:${role.id}`)
          })),
          ...member.additionalPrivileges.map((privilege) => ({
            actorId: member.id,
            date: sourceDates.privilegeDates.get(privilege.id),
            permission: sourceOf(`privilege:${privilege.id}`)
          }))
        ];
      }),
      ...groupMembers.map(({ group, actorId, joinedAt }) => {
        const groupChangedAt = sourceDates.groupDates.get(group.id);
        return {
          actorId,
          date: groupChangedAt && groupChangedAt > joinedAt ? groupChangedAt : joinedAt,
          permission: once(() =>
            permissionForActor({ actorId, groupIds: [group.id], groupsOnly: true, ...detailsOf(actorId) })
          )
        };
      }),
      ...[...folderAccessByActorId].flatMap(([actorId, grants]) =>
        grants.map((grant) => ({
          actorId,
          date: sourceDates.privilegeDates.get(grant.id),
          folderId: grant.folderId,
          restartsFolder: sourceDates.editedPrivilegeIds.has(grant.id),
          permission: once(() =>
            createMongoAbility<ProjectPermissionSet>(buildFolderScopedPrivilegeRules([grant]), { conditionsMatcher })
          )
        }))
      )
    ];

    // A group's expired temporary role reached each of its members.
    const membersByGroupId = groupBy(groupMembers, (member) => member.group.id);
    const accessReopenedAt = new Map<string, Date>();
    sourceDates.accessReopenedAt.forEach((date, holderId) => {
      (membersByGroupId[holderId]?.map((member) => member.actorId) ?? [holderId]).forEach((actorId) => {
        const current = accessReopenedAt.get(actorId);
        if (!current || date > current) accessReopenedAt.set(actorId, date);
      });
    });

    return {
      readersByRules: Object.values(groupBy(readers, (reader) => JSON.stringify(reader.permission.rules))),
      adminActorIds,
      ...createAccessDating(
        groupBy(sources, (source) => source.actorId),
        sourceDates.folderReopenedAt,
        accessReopenedAt
      ),
      // A secret's tracked period starts no earlier than tracking did, so until a whole window has been tracked no
      // secret covers it and nobody counts as unused access.
      judgedFrom: windowStart,
      trackingStartedAt,
      nameOf,
      directMembers,
      groupMembershipsByActorId,
      folderAccessByActorId
    };
  };

  const getSecretReadActivity = async (
    { projectId, environment, secretPath, secretName }: TGetSecretReadActivityDTO,
    actor: OrgServiceActor
  ) => {
    const { permission } = await checkInsightsPermission(permissionService, licenseService, projectId, actor);

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
    const { entitled, unread, readsByActorId } = summarizeSecretAccess(activity, access);
    const unusedActorIds = new Set(unread.map((reader) => reader.actorId));

    const actors = entitled.map((reader): TSecretReadActivityActor => {
      const lastReadAt = readsByActorId.get(reader.actorId)?.lastReadAt ?? null;
      const isProjectAdmin = access.adminActorIds.has(reader.actorId);
      // Every reader has at least one dated source; without one, access is as old as the secret's tracked period.
      const accessSince = access.accessSinceOf(reader, activity) ?? activity.trackedSince;
      return {
        actorType: reader.actorType,
        actorId: reader.actorId,
        name: access.nameOf(reader.actorId),
        isProjectAdmin,
        lastReadAt,
        accessSince,
        ...getReadStatus({
          lastReadAt,
          isUnused: unusedActorIds.has(reader.actorId),
          isProjectAdmin,
          accessSince,
          judgedFrom: access.judgedFrom,
          trackingStartedAt: access.trackingStartedAt
        })
      };
    });

    return {
      readsTrackedSince: activity.trackedSince,
      unusedAccessFrom: getUnusedAccessFrom(access.trackingStartedAt),
      actors: actors.sort((a, b) => a.name.localeCompare(b.name))
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
    for (const activity of activities) {
      // eslint-disable-next-line no-await-in-loop
      await setImmediate();
      const { nonAdmins, unread } = summarizeSecretAccess(activity, access);
      nonAdmins.forEach(({ actorType, actorId }) => {
        const tally = tallies.get(actorId) ?? {
          actorType,
          actorId,
          accessibleSecretCount: 0,
          unusedSecretCount: 0,
          unusedSecretIds: [],
          environments: new Set()
        };
        tally.accessibleSecretCount += 1;
        tallies.set(actorId, tally);
      });
      // Every unread reader is also a non-admin, so its tally exists.
      unread.forEach(({ actorId }) => {
        const tally = tallies.get(actorId) as TUnusedAccessTally;
        tally.unusedSecretCount += 1;
        tally.environments.add(activity.environment);
        if (tally.unusedSecretIds.length < UNUSED_ACCESS_MAX_SECRETS_PER_ACTOR) {
          tally.unusedSecretIds.push(activity.secret.id);
        }
      });
    }
    return { tallies, access };
  };

  // Every user and machine identity that can read secrets it has not read in the window, whether through a role, a
  // privilege or a group. Ranked by how many such secrets it has.
  const $computeUnusedAccess = async (projectId: string, orgId: string): Promise<TUnusedAccessSummary> => {
    const { tallies, access } = await $tallyUnusedAccess(projectId, orgId);
    const ranked = [...tallies.values()]
      .filter((tally) => tally.unusedSecretCount > 0)
      .sort((a, b) => b.unusedSecretCount - a.unusedSecretCount || a.accessibleSecretCount - b.accessibleSecretCount);

    const rows = ranked.map((tally): TUnusedAccessActor => {
      const member = access.directMembers.get(tally.actorId);
      return {
        actorType: tally.actorType,
        actorId: tally.actorId,
        name: access.nameOf(tally.actorId),
        accessibleSecretCount: tally.accessibleSecretCount,
        unusedSecretCount: tally.unusedSecretCount,
        environments: [...tally.environments].sort(),
        accessPaths: {
          roles: toUnusedAccessRoles(member?.roles ?? []),
          groups: (access.groupMembershipsByActorId[tally.actorId] ?? []).map(({ group }) => ({
            id: group.id,
            name: group.name,
            roles: toUnusedAccessRoles(group.roles)
          })),
          additionalPrivileges: member?.additionalPrivileges ?? [],
          folderAccess: (access.folderAccessByActorId.get(tally.actorId) ?? []).map(
            ({ id, folderId, role, environmentSlug, secretPath }) => ({
              id,
              folderId,
              environment: environmentSlug,
              secretPath,
              role: role as SecretFolderRole
            })
          )
        }
      };
    });
    // The unread secrets themselves are kept for the actors with the most of them, so the sheet lists them without
    // another scan; anyone further down is scanned for on their own when opened.
    const details = Object.fromEntries(
      ranked.slice(0, UNUSED_ACCESS_DETAIL_MAX_ACTORS).map((tally) => [tally.actorId, tally.unusedSecretIds])
    );
    return { rows, details };
  };

  // The whole project is computed once a day and cached, so paging through it is cheap.
  const $getCachedUnusedAccess = async (projectId: string, orgId: string) => {
    const unusedAccessFrom = getUnusedAccessFrom((await $getProjectTrackingStartedAt(projectId)).trackingStartedAt);
    // Before then nobody can count as unused access, so the project is not scanned, and no empty result is cached to
    // outlive the wait.
    if (unusedAccessFrom > new Date()) {
      const summary: TUnusedAccessSummary = { rows: [], details: {} };
      return { ...summary, unusedAccessFrom, remainingTTL: -1 };
    }

    const cacheKey = KeyStorePrefixes.InsightsCache(projectId, "unused-access");
    const summary = await withCache({
      keyStore,
      key: cacheKey,
      ttlSeconds: KeyStoreTtls.InsightsUnusedAccessCacheInSeconds,
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
            .setItemWithExpiry(cacheKey, KeyStoreTtls.InsightsUnusedAccessCacheInSeconds, JSON.stringify(result))
            .catch((error) => {
              logger.warn(error, `unused-access: failed to cache the project computation [projectId=${projectId}]`);
            });
          return result;
        } finally {
          await lock?.release();
        }
      }
    });
    const remainingTTL = await getCacheTtl(keyStore, cacheKey);
    return { ...summary, unusedAccessFrom, remainingTTL };
  };

  const listUnusedAccess = async (
    { projectId, offset, limit, search }: TListUnusedAccessDTO,
    actor: OrgServiceActor
  ) => {
    await checkInsightsPermission(permissionService, licenseService, projectId, actor);
    const { rows, unusedAccessFrom, remainingTTL } = await $getCachedUnusedAccess(projectId, actor.orgId);
    const needle = search?.trim().toLowerCase();
    const matching = needle ? rows.filter((row) => row.name.toLowerCase().includes(needle)) : rows;
    return {
      result: { actors: matching.slice(offset, offset + limit), totalCount: matching.length, unusedAccessFrom },
      remainingTTL
    };
  };

  const getUnusedAccessActor = async (
    { projectId, actorType, actorId }: TGetUnusedAccessActorDTO,
    actor: OrgServiceActor
  ) => {
    const { permission } = await checkInsightsPermission(permissionService, licenseService, projectId, actor);
    const { rows, details, unusedAccessFrom, remainingTTL } = await $getCachedUnusedAccess(projectId, actor.orgId);
    const unusedAccessActor = rows.find((row) => row.actorType === actorType && row.actorId === actorId);
    if (!unusedAccessActor) {
      throw new NotFoundError({
        message: `No unused access found for ${actorType} '${actorId}' in this project`
      });
    }
    // An actor past those cached in full is scanned for on its own, and kept only until the project result expires, so
    // its secrets never outlive the counts shown beside them.
    const secretIds =
      details[actorId] ??
      (await withCache({
        keyStore,
        key: KeyStorePrefixes.InsightsCache(projectId, `unused-access:${actorType}:${actorId}`),
        ttlSeconds: Math.max(remainingTTL, 1),
        fetcher: async () =>
          (await $tallyUnusedAccess(projectId, actor.orgId)).tallies.get(actorId)?.unusedSecretIds ?? []
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
    return { result: { actor: unusedAccessActor, secrets, unusedAccessFrom }, remainingTTL };
  };

  return {
    recordRead: secretReadActivityQueue.recordRead,
    recordBulkRead: secretReadActivityQueue.recordBulkRead,
    getSecretReadActivity,
    listUnusedAccess,
    getUnusedAccessActor
  };
};
