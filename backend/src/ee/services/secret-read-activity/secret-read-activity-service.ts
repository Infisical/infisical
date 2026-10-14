import { SecretType, TableName, TSecretFolders } from "@app/db/schemas";
import { TClickHouseAuditLogDALFactory } from "@app/ee/services/audit-log/audit-log-clickhouse-dal";
import { TAuditLogDALFactory } from "@app/ee/services/audit-log/audit-log-dal";
import { hasAuditLogRetention } from "@app/ee/services/audit-log/audit-log-retention-fns";
import {
  isAuditLogEventEnabled,
  TAuditLogSettingsServiceFactory
} from "@app/ee/services/audit-log/audit-log-settings-service";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
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
import { KeyStorePrefixes, KeyStoreTtls, TKeyStoreFactory } from "@app/keystore/keystore";
import { getCacheTtl, withCache } from "@app/lib/cache/with-cache";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { groupBy } from "@app/lib/fn";
import { OrderByDirection, OrgServiceActor } from "@app/lib/types";
import { ActorType } from "@app/services/auth/auth-type";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { TProjectEnvDALFactory } from "@app/services/project-env/project-env-dal";
import { TSecretFolderDALFactory } from "@app/services/secret-folder/secret-folder-dal";
import { buildFolderIdMap, buildFolderPath } from "@app/services/secret-folder/secret-folder-fns";
import { TSecretFolderVersionDALFactory } from "@app/services/secret-folder/secret-folder-version-dal";
import { TSecretImportDALFactory } from "@app/services/secret-import/secret-import-dal";
import { getAllSecretReferences } from "@app/services/secret-v2-bridge/secret-reference-fns";
import { TSecretV2BridgeDALFactory } from "@app/services/secret-v2-bridge/secret-v2-bridge-dal";

import {
  classifySecretReads,
  computeSecretReach,
  indexSecretReads,
  SECRET_READ_EVENT_TYPES,
  toLocationKey
} from "./secret-read-activity-fns";
import {
  SecretReadStatus,
  TGetSecretReadActivityDTO,
  TListUnusedSecretAccessDTO,
  TReadActivityScope,
  TSecretReachGraph,
  TUnusedSecretAccess
} from "./secret-read-activity-types";

const SECRET_READ_ACTIVITY_WINDOW_DAYS = 30;

type TSecretReadActivityServiceFactoryDep = {
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission" | "getProjectPermissions">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  auditLogSettingsService: Pick<TAuditLogSettingsServiceFactory, "getEffectiveSettings">;
  auditLogDAL: Pick<TAuditLogDALFactory, "findLastSecretReads">;
  clickhouseAuditLogDAL?: Pick<TClickHouseAuditLogDALFactory, "findLastSecretReads">;
  folderDAL: Pick<TSecretFolderDALFactory, "findByProjectId">;
  folderVersionDAL: Pick<TSecretFolderVersionDALFactory, "find">;
  projectEnvDAL: Pick<TProjectEnvDALFactory, "find">;
  secretImportDAL: Pick<TSecretImportDALFactory, "findByFolderIds">;
  secretV2BridgeDAL: Pick<TSecretV2BridgeDALFactory, "find" | "findSecretReferencesByProjectId">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  keyStore: Pick<TKeyStoreFactory, "setItemWithExpiry" | "getItem" | "ttl">;
};

export type TSecretReadActivityServiceFactory = ReturnType<typeof secretReadActivityServiceFactory>;

export const secretReadActivityServiceFactory = ({
  permissionService,
  licenseService,
  auditLogSettingsService,
  auditLogDAL,
  clickhouseAuditLogDAL,
  folderDAL,
  folderVersionDAL,
  projectEnvDAL,
  secretImportDAL,
  secretV2BridgeDAL,
  kmsService,
  keyStore
}: TSecretReadActivityServiceFactoryDep) => {
  const $getReadActivity = async ({ projectId, orgId, windowDays, secret: requestedSecret }: TReadActivityScope) => {
    const settings = await auditLogSettingsService.getEffectiveSettings(orgId, projectId);
    if (!isAuditLogEventEnabled(settings, EventType.GET_SECRETS, projectId)) {
      throw new BadRequestError({
        message:
          "Secret reads are not recorded for this project because data access audit logging is turned off. Turn it on in the project's audit log settings to see read activity."
      });
    }
    const plan = await licenseService.getPlan(orgId);
    if (!hasAuditLogRetention(plan)) {
      throw new BadRequestError({
        message: "Your plan does not retain audit logs, so secret read activity is unavailable."
      });
    }
    const now = new Date();
    const windowStart = new Date(
      now.getTime() - Math.min(windowDays, plan.auditLogsRetentionDays ?? windowDays) * DAY_IN_MS
    );

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
    const ancestryOf = (folderId: string) => {
      const chain: string[] = [];
      let folder: TSecretFolders | undefined = folderById[folderId];
      while (folder && !chain.includes(folder.id)) {
        chain.push(folder.id);
        folder = folder.parentId ? folderById[folder.parentId] : undefined;
      }
      return chain;
    };

    const requestedFolder =
      requestedSecret &&
      folders.find(
        (folder) =>
          locationOf(folder.id)?.environment === requestedSecret.environment &&
          pathOf(folder.id) === requestedSecret.secretPath
      );
    if (requestedSecret && !requestedFolder) {
      throw new NotFoundError({
        message: `Folder with path '${requestedSecret.secretPath}' in environment '${requestedSecret.environment}' not found`
      });
    }
    const scopeFolderIds = requestedFolder
      ? [requestedFolder.id]
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

    const importsByLocation = groupBy(
      await secretImportDAL.findByFolderIds(folders.map((folder) => folder.id)),
      (secretImport) => toLocationKey({ environment: secretImport.importEnv.id, secretPath: secretImport.importPath })
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
          : [],
      getParentFolderId: (folderId) => folderById[folderId]?.parentId,
      getLocation: locationOf
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
    const auditLogStore =
      getConfig().CLICKHOUSE_AUDIT_LOG_ENABLED && clickhouseAuditLogDAL ? clickhouseAuditLogDAL : auditLogDAL;
    const reads = indexSecretReads(
      await auditLogStore.findLastSecretReads({
        orgId,
        projectId,
        eventTypes: SECRET_READ_EVENT_TYPES,
        environments: [...new Set(reaches.flatMap((reach) => [...reach.environments]))],
        startDate: windowStart.toISOString(),
        endDate: now.toISOString()
      })
    );

    // A read can only match the secret's current path once that path exists, so the window starts no
    // earlier than the last time the secret, its folders or its environment were created, renamed or moved.
    // Folder versions are written on each of those.
    const lastPathChangeAt = new Map<string, number>();
    const chainFolderIds = [...new Set(scopeFolderIds.flatMap(ancestryOf))];
    chainFolderIds.forEach((folderId) => lastPathChangeAt.set(folderId, folderById[folderId].createdAt.getTime()));
    (await folderVersionDAL.find({ $in: { folderId: chainFolderIds } })).forEach(({ folderId, createdAt }) =>
      lastPathChangeAt.set(folderId, Math.max(lastPathChangeAt.get(folderId) ?? 0, createdAt.getTime()))
    );

    return targets.map(({ secret, environment, secretPath }, index) => {
      const trackedSince = new Date(
        Math.max(
          windowStart.getTime(),
          secret.createdAt.getTime(),
          envById.get(folderById[secret.folderId].envId)?.updatedAt.getTime() ?? 0,
          ...ancestryOf(secret.folderId).map((folderId) => lastPathChangeAt.get(folderId) ?? 0)
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
      orgId: actor.orgId,
      windowDays: SECRET_READ_ACTIVITY_WINDOW_DAYS,
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

  // Everyone who can read a secret's value but has not read it, ranked by the secrets with the most of them.
  const $computeUnusedSecretAccess = async (projectId: string, orgId: string) => {
    const activities = await $getReadActivity({ projectId, orgId, windowDays: SECRET_READ_ACTIVITY_WINDOW_DAYS });
    const { userPermissions, identityPermissions } = await permissionService.getProjectPermissions(projectId, orgId);
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
            const read = reads.get(`${principal.actorType}:${principal.id}`);
            if (read?.status === SecretReadStatus.Read) return [];
            return {
              secretKey: secret.key,
              environment,
              secretPath,
              principalType: principal.actorType,
              principalId: principal.id,
              principalName: principal.name,
              readStatus: read?.status ?? SecretReadStatus.NoReads,
              lastReadAt: read?.lastReadAt ?? null,
              trackedSince
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
      ttlSeconds: KeyStoreTtls.InsightsCacheInSeconds,
      fetcher: () => $computeUnusedSecretAccess(projectId, actor.orgId),
      reviver: (parsed) => {
        reviveDates(parsed, "lastReadAt", "trackedSince");
      }
    });
    const remainingTTL = await getCacheTtl(keyStore, cacheKey);

    // Unsorted, the list keeps its ranking. The sort is stable, so ties keep it too.
    const sorted = orderBy
      ? [...unusedAccess].sort((a, b) => {
          const [first, second] = orderDirection === OrderByDirection.DESC ? [b, a] : [a, b];
          const firstValue = first[orderBy];
          const secondValue = second[orderBy];
          return firstValue instanceof Date && secondValue instanceof Date
            ? firstValue.getTime() - secondValue.getTime()
            : String(firstValue).localeCompare(String(secondValue));
        })
      : unusedAccess;

    return {
      unusedAccess: sorted.slice(offset, offset + limit),
      totalCount: sorted.length,
      remainingTTL
    };
  };

  return { getSecretReadActivity, listUnusedSecretAccess };
};
