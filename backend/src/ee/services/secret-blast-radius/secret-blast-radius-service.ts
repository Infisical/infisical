import { ForbiddenError } from "@casl/ability";
import picomatch from "picomatch";

import { ActionProjectType, SecretType, TableName } from "@app/db/schemas";
import { TAuditLogDALFactory, TSecretReadActivityRow } from "@app/ee/services/audit-log/audit-log-dal";
import { TIdentityGroupMembershipDALFactory } from "@app/ee/services/group/identity-group-membership-dal";
import { TUserGroupMembershipDALFactory } from "@app/ee/services/group/user-group-membership-dal";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { throwIfMissingSecretReadValueOrDescribePermission } from "@app/ee/services/permission/permission-fns";
import {
  TPermissionServiceFactory,
  TProjectPermissionGrantSource
} from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionAuditLogsActions,
  ProjectPermissionInsightsActions,
  ProjectPermissionMemberActions,
  ProjectPermissionSecretActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { ActorType } from "@app/services/auth/auth-type";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TSecretFolderDALFactory } from "@app/services/secret-folder/secret-folder-dal";
import { TSecretV2BridgeDALFactory } from "@app/services/secret-v2-bridge/secret-v2-bridge-dal";

import {
  resolveAllowedSecretActions,
  resolveGrantPaths,
  TSecretSubjectFields
} from "./secret-blast-radius-attribution";
import { TSecretBlastRadiusDALFactory } from "./secret-blast-radius-dal";
import { calculateExposure, simulateRotation, summarizeCounts, TScoringInput } from "./secret-blast-radius-scoring";
import {
  BlastRadiusLeg,
  BlastRadiusWindow,
  DestinationKind,
  DestinationStatus,
  PrincipalAccessFilter,
  PrincipalOrder,
  PrincipalType,
  PrincipalUsageFilter,
  ReadPrecision,
  TBlastRadius,
  TBlastRadiusConsumer,
  TBlastRadiusDestination,
  TBlastRadiusPrincipal,
  TExposureRankingEntry,
  TGetExposureRankingDTO,
  TGetSecretBlastRadiusDTO,
  TSimulateSecretRotationDTO
} from "./secret-blast-radius-types";

type TSecretBlastRadiusServiceFactoryDep = {
  secretBlastRadiusDAL: TSecretBlastRadiusDALFactory;
  permissionService: Pick<
    TPermissionServiceFactory,
    "getProjectPermission" | "getProjectPermissions" | "getProjectPermissionSources"
  >;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  projectDAL: Pick<TProjectDALFactory, "findById">;
  folderDAL: Pick<TSecretFolderDALFactory, "findBySecretPath" | "findSecretPathByFolderIds">;
  secretV2BridgeDAL: Pick<TSecretV2BridgeDALFactory, "findOneWithTags">;
  auditLogDAL: Pick<TAuditLogDALFactory, "aggregateSecretReadActivity" | "findLastSecretReadBefore">;
  userGroupMembershipDAL: Pick<TUserGroupMembershipDALFactory, "find">;
  identityGroupMembershipDAL: Pick<TIdentityGroupMembershipDALFactory, "find">;
};

export type TSecretBlastRadiusServiceFactory = ReturnType<typeof secretBlastRadiusServiceFactory>;

const WINDOW_DAYS: Record<BlastRadiusWindow, number> = {
  [BlastRadiusWindow.SevenDays]: 7,
  [BlastRadiusWindow.ThirtyDays]: 30,
  [BlastRadiusWindow.NinetyDays]: 90
};

// A stale-value check is only useful if it can see past the window, but it still must not turn into an
// unbounded scan of the largest table in the system.
const OUTSIDE_WINDOW_LOOKBACK_DAYS = 365;

// Attribution costs one membership read per principal, so it is capped. Everything past the cap keeps
// its actions and its activity and simply arrives without a resolved path.
const MAX_ATTRIBUTED_PRINCIPALS = 60;
const MAX_DESTINATIONS = 60;
const MAX_CONSUMERS = 100;
const MAX_GROUP_MEMBERS_LISTED = 25;

// The ranking scores real secrets rather than estimating, so it is bounded twice: a cheap SQL prefilter
// picks candidates, and only this many get a full score (one audit-log aggregate each).
const MAX_RANKING_CANDIDATES = 40;
const MAX_RANKED_SECRETS = 25;

const STALE_SYNC_DAYS = 14;

const daysAgo = (from: Date, days: number) => new Date(from.getTime() - days * 24 * 60 * 60 * 1000);

export const secretBlastRadiusServiceFactory = ({
  secretBlastRadiusDAL,
  permissionService,
  licenseService,
  projectDAL,
  folderDAL,
  secretV2BridgeDAL,
  auditLogDAL,
  userGroupMembershipDAL,
  identityGroupMembershipDAL
}: TSecretBlastRadiusServiceFactoryDep) => {
  const resolveSecretContext = async ({
    projectId,
    environment,
    secretPath,
    secretName,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: {
    projectId: string;
    environment: string;
    secretPath: string;
    secretName: string;
    actor: ActorType;
    actorId: string;
    actorAuthMethod: TGetSecretBlastRadiusDTO["actorAuthMethod"];
    actorOrgId: string;
  }) => {
    const plan = await licenseService.getPlan(actorOrgId);
    if (!plan.secretAccessInsights) {
      throw new BadRequestError({
        message: "Failed to fetch secret blast radius due to plan restriction. Upgrade your plan."
      });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    const folder = await folderDAL.findBySecretPath(projectId, environment, secretPath);
    if (!folder) {
      throw new NotFoundError({
        message: `Folder with path '${secretPath}' in environment with slug '${environment}' not found`
      });
    }

    // `key` and `userId` must be table-qualified: findOneWithTags joins resource_metadata, which has a
    // `key` column of its own, and an unqualified filter is ambiguous in Postgres.
    const secret = await secretV2BridgeDAL.findOneWithTags({
      folderId: folder.id,
      [`${TableName.SecretV2}.key` as "key"]: secretName,
      type: SecretType.Shared,
      [`${TableName.SecretV2}.userId` as "userId"]: null
    });
    if (!secret) {
      throw new NotFoundError({
        message: `Secret with name '${secretName}' not found at path '${secretPath}' in environment with slug '${environment}'`
      });
    }

    const subjectFields: TSecretSubjectFields = {
      environment,
      secretPath,
      secretName,
      secretTags: secret.tags?.map((tag) => tag.slug)
    };

    throwIfMissingSecretReadValueOrDescribePermission(
      permission,
      ProjectPermissionSecretActions.DescribeSecret,
      subjectFields
    );

    const versionCreatedAt = await secretBlastRadiusDAL.findCurrentVersionCreatedAt(secret.id, secret.version);

    return {
      plan,
      permission,
      folder,
      secret,
      subjectFields,
      lastValueChangedAt: versionCreatedAt ?? secret.updatedAt
    };
  };

  const buildPrincipals = async ({
    projectId,
    actorOrgId,
    subjectFields
  }: {
    projectId: string;
    actorOrgId: string;
    subjectFields: TSecretSubjectFields;
  }) => {
    const { userPermissions, identityPermissions, groupPermissions } = await permissionService.getProjectPermissions(
      projectId,
      actorOrgId
    );

    const toPrincipal = (
      entry: { id: string; name: string; permission: Parameters<typeof resolveAllowedSecretActions>[0] },
      type: PrincipalType
    ): TBlastRadiusPrincipal => ({
      id: entry.id,
      name: entry.name,
      type,
      actions: resolveAllowedSecretActions(entry.permission, subjectFields),
      grantPaths: [],
      observed: null
    });

    const principals = [
      ...userPermissions.map((entry) => toPrincipal(entry, PrincipalType.User)),
      ...identityPermissions.map((entry) => toPrincipal(entry, PrincipalType.Identity)),
      ...groupPermissions.map((entry) => toPrincipal(entry, PrincipalType.Group))
    ].filter((principal) => principal.actions.length > 0);

    const groupIds = principals.filter((p) => p.type === PrincipalType.Group).map((p) => p.id);
    if (groupIds.length) {
      const [userMemberships, identityMemberships] = await Promise.all([
        userGroupMembershipDAL.find({ $in: { groupId: groupIds } }),
        identityGroupMembershipDAL.find({ $in: { groupId: groupIds } })
      ]);

      const members = await secretBlastRadiusDAL.findGroupMembers(groupIds, MAX_GROUP_MEMBERS_LISTED);

      principals.forEach((principal) => {
        if (principal.type !== PrincipalType.Group) return;
        // eslint-disable-next-line no-param-reassign
        principal.memberCount =
          userMemberships.filter((m) => m.groupId === principal.id).length +
          identityMemberships.filter((m) => m.groupId === principal.id).length;
        // eslint-disable-next-line no-param-reassign
        principal.members = members
          .filter((member) => member.groupId === principal.id)
          .map((member) => ({
            id: member.id,
            name: member.name,
            type: member.isUser ? PrincipalType.User : PrincipalType.Identity
          }));
      });
    }

    return principals;
  };

  const filterPrincipals = (
    principals: TBlastRadiusPrincipal[],
    access: PrincipalAccessFilter,
    usage: PrincipalUsageFilter
  ) =>
    principals
      .filter((principal) => {
        const canReadValue =
          principal.actions.includes(ProjectPermissionSecretActions.ReadValue) ||
          principal.actions.includes(ProjectPermissionSecretActions.DescribeAndReadValue);

        switch (access) {
          case PrincipalAccessFilter.ReadValue:
            return canReadValue;
          case PrincipalAccessFilter.DescribeOnly:
            return !canReadValue;
          case PrincipalAccessFilter.Write:
            return (
              principal.actions.includes(ProjectPermissionSecretActions.Edit) ||
              principal.actions.includes(ProjectPermissionSecretActions.Create) ||
              principal.actions.includes(ProjectPermissionSecretActions.Delete)
            );
          default:
            return true;
        }
      })
      .filter((principal) => {
        const readCount = principal.observed?.readCount ?? 0;

        switch (usage) {
          case PrincipalUsageFilter.NoReads:
            return readCount === 0;
          case PrincipalUsageFilter.Observed:
            return readCount > 0;
          default:
            return true;
        }
      });

  const attributeGrantPaths = async ({
    projectId,
    actorOrgId,
    principals,
    subjectFields
  }: {
    projectId: string;
    actorOrgId: string;
    principals: TBlastRadiusPrincipal[];
    subjectFields: TSecretSubjectFields;
  }) => {
    const attributable = principals.slice(0, MAX_ATTRIBUTED_PRINCIPALS);
    const actors: { id: string; type: ActorType.USER | ActorType.IDENTITY; username: string }[] = attributable
      .filter((principal) => principal.type !== PrincipalType.Group)
      .map((principal) => ({
        id: principal.id,
        type: principal.type === PrincipalType.User ? ActorType.USER : ActorType.IDENTITY,
        username: principal.name
      }));
    const groupIds = attributable.filter((principal) => principal.type === PrincipalType.Group).map((p) => p.id);

    if (!actors.length && !groupIds.length) return;

    const { actorSources, groupSources } = await permissionService.getProjectPermissionSources({
      projectId,
      orgId: actorOrgId,
      actors,
      groupIds
    });

    attributable.forEach((principal) => {
      const sources: TProjectPermissionGrantSource[] =
        (principal.type === PrincipalType.Group ? groupSources[principal.id] : actorSources[principal.id]) ?? [];

      // eslint-disable-next-line no-param-reassign
      principal.grantPaths = resolveGrantPaths(sources, subjectFields);
    });
  };

  const buildDestinations = async ({
    projectId,
    projectSlug,
    folderId,
    envId,
    secretId,
    secretKey,
    environment,
    secretPath
  }: {
    projectId: string;
    projectSlug: string;
    folderId: string;
    envId: string;
    secretId: string;
    secretKey: string;
    environment: string;
    secretPath: string;
  }) => {
    const [syncs, imports, references, folderGrants, rotation, approvalPolicies] = await Promise.all([
      secretBlastRadiusDAL.findSyncsByFolderId(folderId),
      secretBlastRadiusDAL.findImportsOfPath(envId, secretPath),
      secretBlastRadiusDAL.findReferencingSecrets({ environment, secretPath, secretKey }),
      secretBlastRadiusDAL.findFolderGrants(folderId),
      secretBlastRadiusDAL.findRotationBySecretId(secretId),
      secretBlastRadiusDAL.findApprovalPoliciesByEnv(envId)
    ]);

    const now = new Date();
    const destinations: TBlastRadiusDestination[] = [];

    syncs.forEach((sync) => {
      let status = DestinationStatus.Healthy;
      if (sync.syncStatus === "failed") status = DestinationStatus.Failed;
      else if (!sync.lastSyncedAt || sync.lastSyncedAt < daysAgo(now, STALE_SYNC_DAYS))
        status = DestinationStatus.Stale;

      destinations.push({
        id: sync.id,
        kind: DestinationKind.Sync,
        label: sync.name,
        provider: sync.destination,
        status,
        // The provider's own error, never an invented diagnosis.
        statusMessage: sync.lastSyncMessage ?? undefined,
        lastSyncedAt: sync.lastSyncedAt?.toISOString(),
        autoSync: sync.isAutoSyncEnabled,
        crossProject: false
      });
    });

    const importFolderIds = imports.map((row) => row.importingFolderId);
    const importPaths = importFolderIds.length
      ? await folderDAL.findSecretPathByFolderIds(projectId, importFolderIds)
      : [];
    const importPathByFolderId = new Map(importPaths.filter(Boolean).map((entry) => [entry!.id, entry!.path] as const));

    imports.forEach((row) => {
      const path = importPathByFolderId.get(row.importingFolderId) ?? "/";
      destinations.push({
        id: row.id,
        kind: row.isReplication ? DestinationKind.Replication : DestinationKind.Import,
        label: `Imported by ${row.importingEnvSlug}`,
        target: path,
        status:
          row.isReplication && row.isReplicationSuccess === false
            ? DestinationStatus.Failed
            : DestinationStatus.Healthy,
        lastSyncedAt: row.lastReplicated?.toISOString(),
        crossProject: row.importingProjectId !== projectId
      });
    });

    // One referencing secret is one destination. The reference table can hold several rows for the same
    // dependent secret, and drawing a node per row would inflate the graph with duplicates.
    const seenReferencingSecretIds = new Set<string>();

    references
      .filter((row) => row.referencingProjectId === projectId || row.targetProjectSlug === projectSlug)
      .filter((row) => {
        if (seenReferencingSecretIds.has(row.referencingSecretId)) return false;
        seenReferencingSecretIds.add(row.referencingSecretId);
        return true;
      })
      .forEach((row) => {
        destinations.push({
          id: row.id,
          kind: DestinationKind.Reference,
          label: `Referenced by ${row.referencingSecretKey}`,
          target: `${row.referencingEnvSlug}`,
          status: DestinationStatus.Healthy,
          crossProject: row.referencingProjectId !== projectId
        });
      });

    folderGrants.forEach((grant) => {
      destinations.push({
        id: grant.id,
        kind: DestinationKind.FolderGrant,
        label: `Shared with ${grant.targetProjectName}`,
        status: DestinationStatus.Healthy,
        crossProject: true
      });
    });

    const matchingPolicy = approvalPolicies.find((policy) =>
      picomatch.isMatch(secretPath, policy.secretPath, { strictSlashes: false })
    );

    return { destinations, rotation, approvalPolicy: matchingPolicy };
  };

  const buildConsumption = async ({
    projectId,
    actorOrgId,
    environment,
    secretPath,
    secretId,
    secretKey,
    windowDays,
    retentionDays,
    principals
  }: {
    projectId: string;
    actorOrgId: string;
    environment: string;
    secretPath: string;
    secretId: string;
    secretKey: string;
    windowDays: number;
    retentionDays: number;
    principals: TBlastRadiusPrincipal[];
  }) => {
    const effectiveDays = retentionDays > 0 ? Math.min(windowDays, retentionDays) : windowDays;
    const now = new Date();
    const filters = {
      orgId: actorOrgId,
      projectId,
      environment,
      secretPath,
      secretId,
      secretKey
    };

    const [activity, priorReads] = await Promise.all([
      auditLogDAL.aggregateSecretReadActivity({
        ...filters,
        startDate: daysAgo(now, effectiveDays).toISOString(),
        endDate: now.toISOString()
      }),
      auditLogDAL.findLastSecretReadBefore({
        ...filters,
        floorDate: daysAgo(
          now,
          retentionDays > 0 ? Math.min(OUTSIDE_WINDOW_LOOKBACK_DAYS, retentionDays) : OUTSIDE_WINDOW_LOOKBACK_DAYS
        ).toISOString(),
        endDate: daysAgo(now, effectiveDays).toISOString()
      })
    ]);

    const entitledById = new Map(principals.map((principal) => [principal.id, principal] as const));
    const priorReadByActorId = new Map(
      priorReads.filter((row) => row.actorId).map((row) => [row.actorId as string, row.lastReadAt] as const)
    );

    const toConsumer = (row: TSecretReadActivityRow, entitledNow: boolean, principalExists: boolean) => ({
      actorId: row.actorId,
      actorType: row.actor,
      label: row.label ?? row.actorId ?? "Unknown actor",
      authMethod: row.authMethod ?? undefined,
      clients: (row.clients ?? []).filter((client): client is string => Boolean(client)),
      readCount: row.exactReadCount + row.folderReadCount,
      lastReadAt: new Date(row.lastReadAt).toISOString(),
      // A bulk read never names the key it returned, so any folder-scoped read keeps the whole
      // consumer at folder precision rather than implying we know it touched this key.
      precision: row.folderReadCount > 0 ? ReadPrecision.Folder : ReadPrecision.Secret,
      entitledNow,
      principalExists
    });

    const unentitled = activity.filter((row) => !row.actorId || !entitledById.has(row.actorId));
    const { users, identities } = await secretBlastRadiusDAL.findExistingPrincipals({
      userIds: unentitled.filter((row) => row.actor === ActorType.USER && row.actorId).map((row) => row.actorId!),
      identityIds: unentitled
        .filter((row) => row.actor === ActorType.IDENTITY && row.actorId)
        .map((row) => row.actorId!)
    });
    const existingIds = new Set<string>([...users.map((u) => u.id), ...identities.map((i) => i.id)]);

    const consumers: TBlastRadiusConsumer[] = [];
    const ghostReaders: TBlastRadiusConsumer[] = [];

    activity.forEach((row) => {
      const entitledNow = Boolean(row.actorId && entitledById.has(row.actorId));
      const consumer = toConsumer(
        row,
        entitledNow,
        entitledNow || Boolean(row.actorId && existingIds.has(row.actorId))
      );

      consumers.push(consumer);
      if (!entitledNow) ghostReaders.push(consumer);

      const principal = row.actorId ? entitledById.get(row.actorId) : undefined;
      if (principal) {
        principal.observed = {
          readCount: consumer.readCount,
          lastReadAt: consumer.lastReadAt,
          lastReadOutsideWindow: false,
          precision: consumer.precision,
          clients: consumer.clients
        };
      }
    });

    // "No reads in 30d" and "last read 46 days ago" are different findings; only the second one says a
    // consumer is holding a stale value.
    principals.forEach((principal) => {
      if (principal.observed) return;
      const priorRead = priorReadByActorId.get(principal.id);
      if (!priorRead) return;

      // eslint-disable-next-line no-param-reassign
      principal.observed = {
        readCount: 0,
        lastReadAt: new Date(priorRead).toISOString(),
        lastReadOutsideWindow: true,
        precision: null,
        clients: []
      };
    });

    return { consumers, ghostReaders, effectiveDays };
  };

  const collectBlastRadius = async (
    dto: TGetSecretBlastRadiusDTO | TSimulateSecretRotationDTO,
    legs: BlastRadiusLeg[]
  ) => {
    const { projectId, environment, secretPath, secretName, window, actor, actorId, actorAuthMethod, actorOrgId } = dto;

    const { plan, permission, folder, secret, subjectFields, lastValueChangedAt } = await resolveSecretContext({
      projectId,
      environment,
      secretPath,
      secretName,
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId
    });

    // Listing every principal in a project is a disclosure of its roster, so it needs member-read on
    // top of access to the secret itself.
    const canListPrincipals = permission.can(ProjectPermissionMemberActions.Read, ProjectPermissionSub.Member);
    // Per-person read activity is separately permissioned: a viewer without audit-log access gets the
    // entitlement and distribution legs and no activity at all.
    const canReadActivity = permission.can(ProjectPermissionAuditLogsActions.Read, ProjectPermissionSub.AuditLogs);
    // The consumption leg is the slow one, so a caller can ask for the fast legs first and upgrade the
    // graph when activity lands. Permission still decides whether it is available at all.
    const consumptionRequested = legs.includes(BlastRadiusLeg.Consumption);

    const principals = canListPrincipals
      ? await buildPrincipals({ projectId, actorOrgId, subjectFields })
      : ([] as TBlastRadiusPrincipal[]);

    // The slug is what a cross-project reference points at, so it is needed to tell a reference
    // aimed at this project apart from one that merely shares an environment slug and path.
    const project = await projectDAL.findById(projectId);

    const { destinations, rotation, approvalPolicy } = await buildDestinations({
      projectId,
      projectSlug: project?.slug ?? "",
      folderId: folder.id,
      envId: folder.envId,
      secretId: secret.id,
      secretKey: secret.key,
      environment,
      secretPath
    });

    const windowDays = WINDOW_DAYS[window];
    let consumers: TBlastRadiusConsumer[] = [];
    let ghostReaders: TBlastRadiusConsumer[] = [];
    let effectiveDays = windowDays;

    if (canReadActivity && consumptionRequested) {
      const consumption = await buildConsumption({
        projectId,
        actorOrgId,
        environment,
        secretPath,
        secretId: secret.id,
        secretKey: secret.key,
        windowDays,
        retentionDays: plan.auditLogsRetentionDays ?? 0,
        principals
      });

      consumers = consumption.consumers;
      ghostReaders = consumption.ghostReaders;
      effectiveDays = consumption.effectiveDays;
    }

    const scoringInput: TScoringInput = {
      principals,
      destinations,
      consumers,
      ghostReaders,
      lastValueChangedAt,
      isRotationManaged: Boolean(rotation),
      rotationIntervalDays: rotation?.rotationInterval ?? null,
      hasApprovalPolicy: Boolean(approvalPolicy),
      approvalPolicyName: approvalPolicy?.name,
      // Without activity there is no score. Scoring the remaining terms would publish a number that
      // silently changes once activity arrives, which is worse than showing none.
      consumptionAvailable: canReadActivity && consumptionRequested,
      windowDays: effectiveDays,
      now: new Date()
    };

    return {
      secret,
      folder,
      environment,
      secretPath,
      lastValueChangedAt,
      rotation,
      approvalPolicy,
      principals,
      destinations,
      consumers,
      ghostReaders,
      canReadActivity,
      consumptionRequested,
      windowDays,
      effectiveDays,
      scoringInput
    };
  };

  const getSecretBlastRadius = async (dto: TGetSecretBlastRadiusDTO): Promise<TBlastRadius> => {
    const collected = await collectBlastRadius(dto, dto.include);
    const { principals, destinations, consumers, ghostReaders } = collected;

    // The score reads the whole project, not the drawn page or the filtered subset, so it is computed
    // before either is applied. A filter changes what you are looking at, not how exposed the secret is.
    const exposure = calculateExposure(collected.scoringInput);

    const filtered = filterPrincipals(principals, dto.principalAccess, dto.principalUsage);

    const ordered = [...filtered].sort((a, b) => {
      if (dto.principalOrder === PrincipalOrder.Name) return a.name.localeCompare(b.name);

      const aReads = a.observed?.readCount ?? 0;
      const bReads = b.observed?.readCount ?? 0;
      if (dto.principalOrder === PrincipalOrder.MostReadsFirst) return bReads - aReads;
      // Default: the principals nobody can account for come first, because they are the finding.
      if (aReads === bReads) return a.name.localeCompare(b.name);
      return aReads - bReads;
    });

    const drawnPrincipals = ordered.slice(dto.principalOffset, dto.principalOffset + dto.principalLimit);
    const notDrawn = ordered.filter((principal) => !drawnPrincipals.includes(principal));

    // Attribution costs a membership read per principal, so it runs on the page being drawn rather
    // than on the head of the list. Paging to the second page has to resolve that page's paths too.
    if (dto.include.includes(BlastRadiusLeg.Entitlement)) {
      await attributeGrantPaths({
        projectId: dto.projectId,
        actorOrgId: dto.actorOrgId,
        principals: drawnPrincipals,
        subjectFields: {
          environment: dto.environment,
          secretPath: dto.secretPath,
          secretName: dto.secretName,
          secretTags: collected.secret.tags?.map((tag) => tag.slug)
        }
      });
    }

    return {
      secret: {
        id: collected.secret.id,
        key: collected.secret.key,
        environment: dto.environment,
        environmentName: collected.folder.environment.name,
        secretPath: dto.secretPath,
        folderId: collected.folder.id,
        version: collected.secret.version,
        lastValueChangedAt: collected.lastValueChangedAt.toISOString(),
        isRotationManaged: Boolean(collected.rotation),
        hasApprovalPolicy: Boolean(collected.approvalPolicy)
      },
      exposure,
      principals: drawnPrincipals,
      destinations: destinations.slice(0, MAX_DESTINATIONS),
      consumers: consumers.slice(0, MAX_CONSUMERS),
      ghostReaders,
      window: {
        requestedDays: collected.windowDays,
        effectiveDays: collected.effectiveDays,
        boundByRetention: collected.effectiveDays < collected.windowDays,
        consumptionAvailable: collected.canReadActivity
      },
      truncated: {
        principals: {
          drawn: drawnPrincipals.length,
          total: ordered.length,
          notDrawnWithReads: notDrawn.filter((principal) => (principal.observed?.readCount ?? 0) > 0).length,
          notDrawnWithoutReads: notDrawn.filter((principal) => (principal.observed?.readCount ?? 0) === 0).length
        },
        destinations: { drawn: Math.min(destinations.length, MAX_DESTINATIONS), total: destinations.length },
        consumers: { drawn: Math.min(consumers.length, MAX_CONSUMERS), total: consumers.length }
      }
    };
  };

  /**
   * The most exposed secrets in a project, scored the same way a single secret is.
   *
   * Scoring every secret would mean an audit-log aggregate per secret, so the work is bounded: a cheap
   * SQL prefilter picks candidates by distribution breadth and value age, and only the top slice is
   * scored for real. The project-wide permission pass is fetched once and reused across candidates,
   * which is what makes the entitlement half cheap.
   */
  const getProjectExposureRanking = async (dto: TGetExposureRankingDTO) => {
    const { projectId, environment, window, actor, actorId, actorAuthMethod, actorOrgId } = dto;

    const plan = await licenseService.getPlan(actorOrgId);
    if (!plan.secretAccessInsights) {
      throw new BadRequestError({
        message: "Failed to fetch exposure ranking due to plan restriction. Upgrade your plan."
      });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionInsightsActions.Read,
      ProjectPermissionSub.Insights
    );

    const canReadActivity = permission.can(ProjectPermissionAuditLogsActions.Read, ProjectPermissionSub.AuditLogs);
    const limit = Math.min(dto.limit, MAX_RANKED_SECRETS);

    const candidates = await secretBlastRadiusDAL.findRankingCandidates({
      projectId,
      environment,
      limit: MAX_RANKING_CANDIDATES
    });
    if (!candidates.length) return { rankings: [] };

    const folderPaths = await folderDAL.findSecretPathByFolderIds(projectId, [
      ...new Set(candidates.map((candidate) => candidate.folderId))
    ]);
    const pathByFolderId = new Map(folderPaths.filter(Boolean).map((entry) => [entry!.id, entry!.path] as const));

    const { userPermissions, identityPermissions, groupPermissions } = await permissionService.getProjectPermissions(
      projectId,
      actorOrgId
    );
    const allEntries = [
      ...userPermissions.map((entry) => ({ entry, type: PrincipalType.User })),
      ...identityPermissions.map((entry) => ({ entry, type: PrincipalType.Identity })),
      ...groupPermissions.map((entry) => ({ entry, type: PrincipalType.Group }))
    ];

    const windowDays = WINDOW_DAYS[window];
    const now = new Date();
    const rankings: TExposureRankingEntry[] = [];

    // Sequential on purpose: each candidate runs an audit-log aggregate, and a wide fan-out here would
    // hold several connections from a ten-connection pool for a dashboard card.
    for (const candidate of candidates) {
      const secretPath = pathByFolderId.get(candidate.folderId) ?? "/";
      const subjectFields: TSecretSubjectFields = {
        environment: candidate.envSlug,
        secretPath,
        secretName: candidate.key
      };

      const principals: TBlastRadiusPrincipal[] = allEntries
        .map(({ entry, type }) => ({
          id: entry.id,
          name: entry.name,
          type,
          actions: resolveAllowedSecretActions(entry.permission, subjectFields),
          grantPaths: [],
          observed: null as TBlastRadiusPrincipal["observed"]
        }))
        .filter((principal) => principal.actions.length > 0);

      // eslint-disable-next-line no-await-in-loop
      const [destinationResult, consumption] = await Promise.all([
        buildDestinations({
          projectId,
          projectSlug: "",
          folderId: candidate.folderId,
          envId: candidate.envId,
          secretId: candidate.secretId,
          secretKey: candidate.key,
          environment: candidate.envSlug,
          secretPath
        }),
        canReadActivity
          ? buildConsumption({
              projectId,
              actorOrgId,
              environment: candidate.envSlug,
              secretPath,
              secretId: candidate.secretId,
              secretKey: candidate.key,
              windowDays,
              retentionDays: plan.auditLogsRetentionDays ?? 0,
              principals
            })
          : Promise.resolve({ consumers: [], ghostReaders: [], effectiveDays: windowDays })
      ]);

      const scoringInput: TScoringInput = {
        principals,
        destinations: destinationResult.destinations,
        consumers: consumption.consumers,
        ghostReaders: consumption.ghostReaders,
        lastValueChangedAt: candidate.versionCreatedAt ?? candidate.updatedAt,
        isRotationManaged: Boolean(destinationResult.rotation),
        rotationIntervalDays: destinationResult.rotation?.rotationInterval ?? null,
        hasApprovalPolicy: Boolean(destinationResult.approvalPolicy),
        approvalPolicyName: destinationResult.approvalPolicy?.name,
        consumptionAvailable: canReadActivity,
        windowDays: consumption.effectiveDays,
        now
      };

      const exposure = calculateExposure(scoringInput);
      const counts = summarizeCounts(scoringInput);

      rankings.push({
        secretId: candidate.secretId,
        secretKey: candidate.key,
        environment: candidate.envSlug,
        environmentName: candidate.envName,
        secretPath,
        score: exposure.score,
        band: exposure.band,
        topDriver: exposure.drivers[0]?.label ?? null,
        entitledCount: counts.entitled,
        noReadsCount: counts.noReads,
        destinationCount: destinationResult.destinations.length,
        ghostReaderCount: consumption.ghostReaders.length,
        valueAgeDays: counts.valueAgeDays
      });
    }

    return {
      rankings: rankings.sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, limit)
    };
  };

  const simulateSecretRotation = async (dto: TSimulateSecretRotationDTO) => {
    // A simulation is only meaningful with every leg: what breaks depends on activity as much as on
    // where the value has been distributed.
    const collected = await collectBlastRadius(dto, Object.values(BlastRadiusLeg));

    return simulateRotation(collected.scoringInput, {
      key: collected.secret.key,
      environment: dto.environment,
      secretPath: dto.secretPath
    });
  };

  return { getSecretBlastRadius, simulateSecretRotation, getProjectExposureRanking };
};
