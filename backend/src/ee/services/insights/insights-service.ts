import { ForbiddenError } from "@casl/ability";

// import geoip from "geoip-lite";
import { ActionProjectType, IdentityAuthMethod, OrganizationActionScope, TableName } from "@app/db/schemas";
import { TClickHouseAuditLogDALFactory } from "@app/ee/services/audit-log/audit-log-clickhouse-dal";
import { TAuditLogDALFactory } from "@app/ee/services/audit-log/audit-log-dal";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { TDynamicSecretDALFactory } from "@app/ee/services/dynamic-secret/dynamic-secret-dal";
import { TDynamicSecretLeaseDALFactory } from "@app/ee/services/dynamic-secret-lease/dynamic-secret-lease-dal";
import { THoneyTokenDALFactory } from "@app/ee/services/honey-token/honey-token-dal";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import {
  OrgPermissionSecretsManagementInsightsActions,
  OrgPermissionSubjects
} from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionHoneyTokenActions,
  ProjectPermissionInsightsActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { TSecretRotationV2DALFactory } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-dal";
import { KeyStorePrefixes, KeyStoreTtls, TKeyStoreFactory } from "@app/keystore/keystore";
import { getCacheTtl, withCache } from "@app/lib/cache/with-cache";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError } from "@app/lib/errors";
import { OrgServiceActor } from "@app/lib/types";
import { ActorType } from "@app/services/auth/auth-type";
import { TIdentityOrgDALFactory } from "@app/services/identity/identity-org-dal";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TProjectBotServiceFactory } from "@app/services/project-bot/project-bot-service";
import { TReminderDALFactory } from "@app/services/reminder/reminder-dal";
import { TSecretFolderDALFactory } from "@app/services/secret-folder/secret-folder-dal";
import { containsSecretReference } from "@app/services/secret-v2-bridge/secret-reference-fns";
import { TSecretV2BridgeDALFactory } from "@app/services/secret-v2-bridge/secret-v2-bridge-dal";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { TInsightsDALFactory } from "./insights-dal";
import {
  addAccessVolumeEntry,
  buildAccessVolumeDayBuckets,
  buildAccessVolumeWindow,
  buildStaticSecretUsageWindow,
  collapseAccessVolumeDays,
  resolveUserDisplayNames,
  toUtcDateString
} from "./insights-fns";
import {
  TGetAccessVolumeDTO,
  TGetAuthMethodDistributionDTO,
  TGetInsightsCalendarDTO,
  TGetInsightsCountsDTO,
  TGetInsightsSummaryDTO,
  TGetSecretsDuplicationDTO,
  TGetSecretsProjectWarningsDTO,
  TOrgAccessVolume,
  TOrgAuthMethodDistribution,
  TOrgInsightsDTO,
  TOrgSecretsCounts,
  TSecretsProjectWarnings,
  TSecretsUsageInsights,
  TStaticSecretsUsage
} from "./insights-types";

export type TInsightsServiceFactoryDep = {
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission" | "getOrgPermission">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  auditLogDAL: Pick<TAuditLogDALFactory, "countByDateAndActor" | "countByAuthMethod">;
  // Undefined when the instance has no ClickHouse configured. Only the org-wide aggregates use it,
  // and each degrades to an unsupported no-op response in that case.
  clickhouseAuditLogDAL?: Pick<TClickHouseAuditLogDALFactory, "countByDateForOrg" | "countByIdentityAuthMethodForOrg">;
  secretRotationV2DAL: Pick<
    TSecretRotationV2DALFactory,
    "findByProjectAndDateRange" | "findByProject" | "countByProject"
  >;
  reminderDAL: Pick<TReminderDALFactory, "findByProjectAndDateRange">;
  folderDAL: Pick<TSecretFolderDALFactory, "findSecretPathByFolderIds" | "countByProject">;
  secretV2BridgeDAL: Pick<
    TSecretV2BridgeDALFactory,
    "findStaleByProject" | "countStaleByProject" | "findDuplicatedSecretValues" | "countByProject"
  >;
  dynamicSecretDAL: Pick<TDynamicSecretDALFactory, "countByProject">;
  honeyTokenDAL: Pick<THoneyTokenDALFactory, "countByProjectId">;
  projectBotService: Pick<TProjectBotServiceFactory, "getBotKey">;
  projectDAL: Pick<TProjectDALFactory, "findById">;
  userDAL: Pick<TUserDALFactory, "find">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  keyStore: Pick<TKeyStoreFactory, "setItemWithExpiry" | "getItem" | "ttl">;
  orgDAL: Pick<TOrgDALFactory, "countAllOrgMembers">;
  identityOrgMembershipDAL: Pick<TIdentityOrgDALFactory, "countAllOrgIdentities">;
  dynamicSecretLeaseDAL: Pick<TDynamicSecretLeaseDALFactory, "countLeasesForOrg">;
  insightsDAL: Pick<
    TInsightsDALFactory,
    | "findProjectWarningsForOrg"
    | "findSecretCreationsByWeekForOrg"
    | "countSecretCreationsForOrg"
    | "countOrgSecretsResources"
  >;
};

export type TInsightsServiceFactory = ReturnType<typeof insightsServiceFactory>;

const STALE_SECRET_THRESHOLD_DAYS = 90;

const VALUE_EVENT_TYPES = [
  EventType.GET_SECRETS,
  EventType.GET_SECRET,
  EventType.DASHBOARD_GET_SECRET_VALUE,
  EventType.DASHBOARD_GET_SECRET_VERSION_VALUE,
  EventType.GET_SECRET_ROTATION_GENERATED_CREDENTIALS,
  EventType.CREATE_DYNAMIC_SECRET_LEASE
];

// Both halves of the product (the per-project dashboard and the org-wide aggregates) are gated on the
// same entitlement, so the check and its message live in one place.
const assertInsightsPlanEnabled = async (
  licenseService: TInsightsServiceFactoryDep["licenseService"],
  orgId: string
) => {
  const plan = await licenseService.getPlan(orgId);
  if (!plan.secretAccessInsights) {
    throw new BadRequestError({
      message: "Failed to access insights due to plan restriction. Upgrade your plan to access insights."
    });
  }
};

const checkInsightsPermission = async (
  permissionService: TInsightsServiceFactoryDep["permissionService"],
  licenseService: TInsightsServiceFactoryDep["licenseService"],
  projectId: string,
  actor: OrgServiceActor
) => {
  await assertInsightsPlanEnabled(licenseService, actor.orgId);

  const { permission } = await permissionService.getProjectPermission({
    actor: actor.type,
    actorId: actor.id,
    projectId,
    actorAuthMethod: actor.authMethod,
    actorOrgId: actor.orgId,
    actionProjectType: ActionProjectType.SecretManager
  });

  ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionInsightsActions.Read, ProjectPermissionSub.Insights);

  return { permission };
};

export const insightsServiceFactory = ({
  permissionService,
  licenseService,
  auditLogDAL,
  clickhouseAuditLogDAL,
  secretRotationV2DAL,
  reminderDAL,
  folderDAL,
  secretV2BridgeDAL,
  dynamicSecretDAL,
  honeyTokenDAL,
  projectBotService,
  projectDAL,
  userDAL,
  kmsService,
  keyStore,
  orgDAL,
  identityOrgMembershipDAL,
  dynamicSecretLeaseDAL,
  insightsDAL
}: TInsightsServiceFactoryDep) => {
  // Gate for every org-wide aggregate: the org-level read permission plus the insights entitlement.
  const assertOrgInsightsRead = async ({ actor, actorId, orgId, actorAuthMethod, actorOrgId }: TOrgInsightsDTO) => {
    const { permission } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.Any,
      actor,
      actorId,
      orgId,
      actorAuthMethod,
      actorOrgId
    });

    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionSecretsManagementInsightsActions.Read,
      OrgPermissionSubjects.SecretsManagementInsights
    );

    await assertInsightsPlanEnabled(licenseService, orgId);
  };

  const fetchReminders = async (projectId: string, startDate: Date, endDate: Date) => {
    const rawReminders = await reminderDAL.findByProjectAndDateRange({ projectId, startDate, endDate });
    if (!rawReminders.length) return [];

    const folderIds = [...new Set(rawReminders.map((r) => r.folderId))];
    const foldersWithPath = await folderDAL.findSecretPathByFolderIds(projectId, folderIds);
    const folderRecord: Record<string, string> = {};
    foldersWithPath.forEach((folder) => {
      if (folder) folderRecord[folder.id] = folder.path;
    });

    return rawReminders.map((r) => ({
      id: r.id,
      secretId: r.secretId ?? null,
      secretKey: r.secretKey,
      nextReminderDate: r.nextReminderDate,
      message: r.message ?? null,
      environment: r.envSlug,
      secretPath: folderRecord[r.folderId] ?? "/",
      repeatDays: r.repeatDays ?? null
    }));
  };

  const getCalendar = async (dto: TGetInsightsCalendarDTO, actorDto: OrgServiceActor) => {
    await checkInsightsPermission(permissionService, licenseService, dto.projectId, actorDto);

    const cacheKey = KeyStorePrefixes.InsightsCache(dto.projectId, `calendar:${dto.year}-${dto.month}`);
    return withCache({
      keyStore,
      key: cacheKey,
      ttlSeconds: KeyStoreTtls.InsightsCacheInSeconds,
      fetcher: async () => {
        const { shouldUseSecretV2Bridge } = await projectBotService.getBotKey(dto.projectId);
        if (!shouldUseSecretV2Bridge) throw new BadRequestError({ message: "Project version not supported" });

        // Pad by 1 day on each side so events near month boundaries are captured
        // regardless of the caller's timezone offset from UTC.
        const startDate = new Date(Date.UTC(dto.year, dto.month - 1, 0));
        const endDate = new Date(Date.UTC(dto.year, dto.month, 1, 23, 59, 59, 999));

        const [rotations, reminders] = await Promise.all([
          secretRotationV2DAL.findByProjectAndDateRange({ projectId: dto.projectId, startDate, endDate }),
          fetchReminders(dto.projectId, startDate, endDate)
        ]);

        return {
          rotations: rotations.map((r) => ({
            id: r.id,
            name: r.name,
            type: r.type,
            nextRotationAt: r.nextRotationAt ?? null,
            environment: r.environment.slug,
            secretPath: r.folder.path,
            secretKeys: r.secretKeys,
            rotationInterval: r.rotationInterval,
            rotationStatus: r.rotationStatus,
            isAutoRotationEnabled: r.isAutoRotationEnabled
          })),
          reminders
        };
      }
    });
  };

  const getAccessVolume = async (dto: TGetAccessVolumeDTO, actorDto: OrgServiceActor) => {
    await checkInsightsPermission(permissionService, licenseService, dto.projectId, actorDto);

    const cacheKey = KeyStorePrefixes.InsightsCache(dto.projectId, "access-volume");
    return withCache({
      keyStore,
      key: cacheKey,
      ttlSeconds: KeyStoreTtls.InsightsCacheInSeconds,
      fetcher: async () => {
        const { dates, startDate, endDate } = buildAccessVolumeWindow();

        const rows = await auditLogDAL.countByDateAndActor({
          orgId: actorDto.orgId,
          projectId: dto.projectId,
          eventTypes: VALUE_EVENT_TYPES,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString()
        });

        const userNameMap = await resolveUserDisplayNames(userDAL, [
          ...new Set(
            rows
              .filter((r) => r.actor === ActorType.USER)
              .map((r) => (r.actorMetadata as Record<string, string> | null)?.userId)
              .filter(Boolean) as string[]
          )
        ]);

        const dayMap = buildAccessVolumeDayBuckets(dates);

        rows.forEach((row) => {
          const actorMeta = row.actorMetadata as Record<string, string> | null;
          let actorName: string;
          if (row.actor === ActorType.USER && actorMeta?.userId) {
            actorName = userNameMap.get(actorMeta.userId) || actorMeta.email || actorMeta.username || "Unknown";
          } else if (row.actor === ActorType.USER) {
            actorName = actorMeta?.email || actorMeta?.username || "Unknown";
          } else {
            actorName = actorMeta?.name || actorMeta?.identityId || "Unknown";
          }

          addAccessVolumeEntry(dayMap, {
            date: typeof row.date === "string" ? row.date : new Date(row.date).toISOString().slice(0, 10),
            type: row.actor,
            name: actorName,
            count: row.count
          });
        });

        return { days: collapseAccessVolumeDays(dayMap) };
      }
    });
  };

  const getAuthMethodDistribution = async (dto: TGetAuthMethodDistributionDTO, actorDto: OrgServiceActor) => {
    await checkInsightsPermission(permissionService, licenseService, dto.projectId, actorDto);

    const cacheKey = KeyStorePrefixes.InsightsCache(dto.projectId, `auth-methods:${dto.days}`);
    return withCache({
      keyStore,
      key: cacheKey,
      ttlSeconds: KeyStoreTtls.InsightsCacheInSeconds,
      fetcher: async () => {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setUTCDate(startDate.getUTCDate() - dto.days);

        const authRows = await auditLogDAL.countByAuthMethod({
          orgId: actorDto.orgId,
          projectId: dto.projectId,
          eventTypes: VALUE_EVENT_TYPES,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString()
        });

        const methodCounts = new Map<string, number>();

        const authMethodLabels: Record<string, string> = {
          email: "Email",
          google: "Google",
          github: "GitHub",
          gitlab: "GitLab",
          "okta-saml": "Okta SAML",
          "azure-saml": "Azure SAML",
          "jumpcloud-saml": "JumpCloud SAML",
          "google-saml": "Google SAML",
          "keycloak-saml": "Keycloak SAML",
          ldap: "LDAP",
          oidc: "OIDC"
        };

        const identityAuthMethodLabels: Record<IdentityAuthMethod, string> = {
          [IdentityAuthMethod.UNIVERSAL_AUTH]: "Universal Auth",
          [IdentityAuthMethod.TOKEN_AUTH]: "Token Auth",
          [IdentityAuthMethod.KUBERNETES_AUTH]: "Kubernetes",
          [IdentityAuthMethod.GCP_AUTH]: "GCP Auth",
          [IdentityAuthMethod.AWS_AUTH]: "AWS Auth",
          [IdentityAuthMethod.AZURE_AUTH]: "Azure Auth",
          [IdentityAuthMethod.OIDC_AUTH]: "OIDC",
          [IdentityAuthMethod.JWT_AUTH]: "JWT Auth",
          [IdentityAuthMethod.LDAP_AUTH]: "LDAP Auth",
          [IdentityAuthMethod.ALICLOUD_AUTH]: "AliCloud Auth",
          [IdentityAuthMethod.TLS_CERT_AUTH]: "TLS Certificate",
          [IdentityAuthMethod.OCI_AUTH]: "OCI Auth",
          [IdentityAuthMethod.SPIFFE_AUTH]: "SPIFFE Auth"
        };

        authRows.forEach((row) => {
          const actorMeta = row.actorMetadata as Record<string, unknown> | null;
          let method = "Unknown";

          if (row.actor === "user") {
            const raw = (actorMeta?.authMethod as string) || "Unknown";
            method = authMethodLabels[raw] || raw;
          } else if (row.actor === "identity") {
            const identityAuth = actorMeta?.authMethod as IdentityAuthMethod | undefined;
            method = identityAuth ? identityAuthMethodLabels[identityAuth] || identityAuth : "Unknown";
          } else if (row.actor === "service") {
            method = "Service Token";
          } else {
            method = row.actor;
          }

          methodCounts.set(method, (methodCounts.get(method) || 0) + (row.count || 0));
        });

        const methods = Array.from(methodCounts.entries())
          .map(([method, count]) => ({ method, count }))
          .sort((a, b) => b.count - a.count);

        return { methods };
      }
    });
  };

  const getSummary = async (dto: TGetInsightsSummaryDTO, actorDto: OrgServiceActor) => {
    await checkInsightsPermission(permissionService, licenseService, dto.projectId, actorDto);

    const cacheKey = KeyStorePrefixes.InsightsCache(
      dto.projectId,
      `summary:${dto.staleSecretsOffset ?? 0}:${dto.staleSecretsLimit ?? 50}`
    );
    return withCache({
      keyStore,
      key: cacheKey,
      ttlSeconds: KeyStoreTtls.InsightsCacheInSeconds,
      fetcher: async () => {
        const { shouldUseSecretV2Bridge } = await projectBotService.getBotKey(dto.projectId);
        if (!shouldUseSecretV2Bridge) throw new BadRequestError({ message: "Project version not supported" });

        const now = new Date();
        const in7Days = new Date(now);
        in7Days.setDate(now.getDate() + 7);
        const lookback90Days = new Date(now);
        lookback90Days.setDate(now.getDate() - STALE_SECRET_THRESHOLD_DAYS);
        const staleThreshold = lookback90Days;

        // Fetch upcoming rotations (by date range) and all failed rotations (no date filter) in parallel
        // Use 90-day lookback to capture overdue items without unbounded historical queries
        const [upcomingRotationsRaw, allProjectRotations, reminders] = await Promise.all([
          secretRotationV2DAL.findByProjectAndDateRange({
            projectId: dto.projectId,
            startDate: lookback90Days,
            endDate: in7Days
          }),
          secretRotationV2DAL.findByProject(dto.projectId),
          fetchReminders(dto.projectId, lookback90Days, in7Days)
        ]);

        const mapRotation = (r: (typeof allProjectRotations)[number]) => ({
          name: r.name,
          environment: r.environment.slug,
          secretPath: r.folder.path,
          nextRotationAt: r.nextRotationAt ?? null,
          rotationStatus: r.rotationStatus
        });

        const mapReminder = (r: (typeof reminders)[number]) => ({
          secretKey: r.secretKey,
          environment: r.environment,
          secretPath: r.secretPath,
          nextReminderDate: r.nextReminderDate
        });

        const upcomingRotations = upcomingRotationsRaw.map(mapRotation);

        const failedRotations = allProjectRotations.filter((r) => r.rotationStatus === "failed").map(mapRotation);
        const upcomingReminders = reminders.filter((r) => new Date(r.nextReminderDate) >= now).map(mapReminder);
        const overdueReminders = reminders.filter((r) => new Date(r.nextReminderDate) < now).map(mapReminder);

        const [rawStaleSecrets, totalStaleCount] = await Promise.all([
          secretV2BridgeDAL.findStaleByProject(dto.projectId, staleThreshold, {
            offset: dto.staleSecretsOffset ?? 0,
            limit: dto.staleSecretsLimit ?? 50
          }),
          secretV2BridgeDAL.countStaleByProject(dto.projectId, staleThreshold)
        ]);

        // Resolve folder paths for stale secrets
        const staleFolderIds = [...new Set(rawStaleSecrets.map((s) => s.folderId))];
        const staleFolders = staleFolderIds.length
          ? await folderDAL.findSecretPathByFolderIds(dto.projectId, staleFolderIds)
          : [];
        const staleFolderMap: Record<string, string> = {};
        staleFolders.forEach((f) => {
          if (f) staleFolderMap[f.id] = f.path;
        });

        const staleSecrets = rawStaleSecrets.map((s) => ({
          key: s.key,
          environment: s.environment,
          secretPath: staleFolderMap[s.folderId] ?? "/",
          updatedAt: s.updatedAt
        }));

        return {
          upcomingRotations,
          failedRotations,
          upcomingReminders,
          overdueReminders,
          staleSecrets,
          totalStaleCount
        };
      }
    });
  };

  const getSecretsDuplication = async (dto: TGetSecretsDuplicationDTO, actorDto: OrgServiceActor) => {
    await checkInsightsPermission(permissionService, licenseService, dto.projectId, actorDto);

    const cacheKey = KeyStorePrefixes.InsightsCache(dto.projectId, "secrets-duplication");

    const project = await projectDAL.findById(dto.projectId);

    if (!project.secretBlindIndexEnabled) {
      return {
        result: {
          secretBlindIndexEnabled: false,
          groups: []
        }
      };
    }

    const result = await withCache({
      keyStore,
      key: cacheKey,
      ttlSeconds: KeyStoreTtls.InsightsDuplicationCacheInSeconds,
      fetcher: async () => {
        const rawGroups = await secretV2BridgeDAL.findDuplicatedSecretValues(dto.projectId);

        const { decryptor: secretManagerDecryptor } = await kmsService.createCipherPairWithDataKey({
          type: KmsDataKey.SecretManager,
          projectId: dto.projectId
        });

        const filteredGroups = rawGroups.filter((g) => {
          if (!g.secrets.length) return false;
          const firstSecret = g.secrets[0];
          if (!firstSecret.encryptedValue) return true;
          const decryptedValue = secretManagerDecryptor({ cipherTextBlob: firstSecret.encryptedValue }).toString();
          return !containsSecretReference(decryptedValue);
        });

        const folderIds = [...new Set(filteredGroups.flatMap((g) => g.secrets.map((s) => s.folderId)))];
        const foldersWithPath = folderIds.length
          ? await folderDAL.findSecretPathByFolderIds(dto.projectId, folderIds)
          : [];
        const folderRecord: Record<string, string> = {};
        foldersWithPath.forEach((f) => {
          if (f) folderRecord[f.id] = f.path;
        });

        const groups = filteredGroups.map((g) => ({
          secrets: g.secrets.map((s) => ({
            key: s.key,
            environment: {
              name: s.environmentName,
              slug: s.environment
            },
            secretPath: folderRecord[s.folderId] ?? "/"
          }))
        }));

        return { secretBlindIndexEnabled: true as const, groups };
      }
    });

    const remainingTTL = await getCacheTtl(keyStore, cacheKey);

    return { result, remainingTTL };
  };

  const getCounts = async (dto: TGetInsightsCountsDTO, actorDto: OrgServiceActor) => {
    const { permission } = await checkInsightsPermission(permissionService, licenseService, dto.projectId, actorDto);

    const cacheKey = KeyStorePrefixes.InsightsCache(dto.projectId, "counts");
    const counts = await withCache({
      keyStore,
      key: cacheKey,
      ttlSeconds: KeyStoreTtls.InsightsCacheInSeconds,
      fetcher: async () => {
        const { shouldUseSecretV2Bridge } = await projectBotService.getBotKey(dto.projectId);
        if (!shouldUseSecretV2Bridge) throw new BadRequestError({ message: "Project version not supported" });

        // Honey tokens are a separately licensed feature; return null when unavailable so the UI hides the stat.
        const plan = await licenseService.getPlan(actorDto.orgId);

        const [secretCount, folderCount, dynamicSecretCount, secretRotationCount, honeyTokenCount] = await Promise.all([
          secretV2BridgeDAL.countByProject(dto.projectId),
          folderDAL.countByProject(dto.projectId),
          dynamicSecretDAL.countByProject(dto.projectId),
          secretRotationV2DAL.countByProject(dto.projectId),
          plan.honeyTokens ? honeyTokenDAL.countByProjectId(dto.projectId) : Promise.resolve(null)
        ]);

        return {
          secretCount,
          folderCount,
          dynamicSecretCount,
          secretRotationCount,
          honeyTokenCount
        };
      }
    });

    // Honey-token presence is sensitive (concealment is the feature) and is gated on HoneyTokens.Read
    // everywhere else, so strip the count for callers lacking that permission. Applied outside withCache
    // so the project-scoped cache key stays permission-independent.
    const canReadHoneyTokens = permission.can(
      ProjectPermissionHoneyTokenActions.Read,
      ProjectPermissionSub.HoneyTokens
    );

    return {
      ...counts,
      honeyTokenCount: canReadHoneyTokens ? counts.honeyTokenCount : null
    };
  };

  const getSecretsUsageInsights = async (dto: TOrgInsightsDTO): Promise<TSecretsUsageInsights> => {
    await assertOrgInsightsRead(dto);

    const [activeLeases, users, identities] = await Promise.all([
      dynamicSecretLeaseDAL.countLeasesForOrg(dto.orgId),
      orgDAL.countAllOrgMembers(dto.orgId),
      identityOrgMembershipDAL.countAllOrgIdentities({
        [`${TableName.Membership}.scopeOrgId` as "scopeOrgId"]: dto.orgId
      })
    ]);

    return { activeLeases, users, identities };
  };

  const getSecretsProjects = async (dto: TGetSecretsProjectWarningsDTO): Promise<TSecretsProjectWarnings> => {
    await assertOrgInsightsRead(dto);

    const cacheKey = KeyStorePrefixes.InsightsCache(dto.orgId, `project-warnings:${dto.offset}:${dto.limit}`);
    return withCache({
      keyStore,
      key: cacheKey,
      ttlSeconds: KeyStoreTtls.InsightsCacheInSeconds,
      fetcher: async () => {
        const staleBefore = new Date();
        staleBefore.setDate(staleBefore.getDate() - STALE_SECRET_THRESHOLD_DAYS);

        const { projects, totalProjects, projectsWithIssues } = await insightsDAL.findProjectWarningsForOrg(dto.orgId, {
          offset: dto.offset,
          limit: dto.limit,
          staleBefore
        });

        return { projects, totalProjects, projectsWithIssues, offset: dto.offset, limit: dto.limit };
      }
    });
  };

  const getOrgAccessVolume = async (dto: TOrgInsightsDTO): Promise<TOrgAccessVolume> => {
    await assertOrgInsightsRead(dto);

    const appCfg = getConfig();
    if (!appCfg.CLICKHOUSE_AUDIT_LOG_ENABLED || !clickhouseAuditLogDAL) {
      return { days: [], isSupported: false };
    }

    const cacheKey = KeyStorePrefixes.InsightsCache(dto.orgId, "org-access-volume");
    return withCache({
      keyStore,
      key: cacheKey,
      ttlSeconds: KeyStoreTtls.InsightsCacheInSeconds,
      fetcher: async () => {
        const { dates, startDate, endDate } = buildAccessVolumeWindow();

        const rows = await clickhouseAuditLogDAL.countByDateForOrg({
          orgId: dto.orgId,
          eventTypes: VALUE_EVENT_TYPES,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString()
        });

        const countsByDate = new Map(rows.map((row) => [row.date, row.count]));

        return {
          days: dates.map((date) => ({ date, total: countsByDate.get(date) ?? 0 })),
          isSupported: true
        };
      }
    });
  };

  const getOrgAuthMethodDistribution = async (dto: TOrgInsightsDTO): Promise<TOrgAuthMethodDistribution> => {
    await assertOrgInsightsRead(dto);

    const appCfg = getConfig();
    if (!appCfg.CLICKHOUSE_AUDIT_LOG_ENABLED || !clickhouseAuditLogDAL) {
      return { methods: [], totalFetches: 0, unknownCount: 0, isSupported: false };
    }

    const cacheKey = KeyStorePrefixes.InsightsCache(dto.orgId, "org-auth-method-distribution");
    return withCache({
      keyStore,
      key: cacheKey,
      ttlSeconds: KeyStoreTtls.InsightsCacheInSeconds,
      fetcher: async () => {
        const { startDate, endDate } = buildAccessVolumeWindow();

        const rows = await clickhouseAuditLogDAL.countByIdentityAuthMethodForOrg({
          orgId: dto.orgId,
          eventTypes: VALUE_EVENT_TYPES,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString()
        });

        const knownAuthMethods = new Set<string>(Object.values(IdentityAuthMethod));
        const countsByAuthMethod = new Map<IdentityAuthMethod, number>();
        let unknownCount = 0;
        let totalFetches = 0;

        rows.forEach((row) => {
          totalFetches += row.count;

          // Logs written before the auth method was captured have no authMethod, and an instance
          // reading logs written by a newer version can see a method it does not know yet.
          if (!knownAuthMethods.has(row.authMethod)) {
            unknownCount += row.count;
            return;
          }

          const authMethod = row.authMethod as IdentityAuthMethod;
          countsByAuthMethod.set(authMethod, (countsByAuthMethod.get(authMethod) ?? 0) + row.count);
        });

        const methods = Array.from(countsByAuthMethod.entries())
          .map(([authMethod, count]) => ({ authMethod, count }))
          .sort((a, b) => b.count - a.count);

        return { methods, totalFetches, unknownCount, isSupported: true };
      }
    });
  };

  const getOrgSecretsCounts = async (dto: TOrgInsightsDTO): Promise<TOrgSecretsCounts> => {
    await assertOrgInsightsRead(dto);

    const cacheKey = KeyStorePrefixes.InsightsCache(dto.orgId, "org-counts");
    return withCache({
      keyStore,
      key: cacheKey,
      ttlSeconds: KeyStoreTtls.InsightsCacheInSeconds,
      fetcher: () => insightsDAL.countOrgSecretsResources(dto.orgId)
    });
  };

  // How many static secrets the org created in each of the last 12 UTC calendar weeks.
  //
  // Deleting a secret is a hard delete with no tombstone, so a week can only be counted from the
  // createdAt of secrets that still exist. Past weeks therefore understate what was created then
  // and drift lower as those secrets are deleted.
  const getStaticSecretsUsage = async (dto: TOrgInsightsDTO): Promise<TStaticSecretsUsage> => {
    await assertOrgInsightsRead(dto);

    const { windowStart, currentWeekStart, weekStarts } = buildStaticSecretUsageWindow();
    const currentWeekStartStr = toUtcDateString(currentWeekStart);

    // using two different cache keys because the current week is still in progress, so the count is not yet complete.
    // The prior weeks can have a longer TTL
    const [priorWeeks, createdThisWeek] = await Promise.all([
      withCache({
        keyStore,
        key: KeyStorePrefixes.InsightsCache(dto.orgId, `static-secret-usage:history-weeks:${currentWeekStartStr}`),
        ttlSeconds: KeyStoreTtls.InsightsWeeklyHistoryCacheInSeconds,
        fetcher: () =>
          insightsDAL.findSecretCreationsByWeekForOrg(dto.orgId, {
            createdAtOrAfter: windowStart,
            createdBefore: currentWeekStart
          })
      }),
      withCache({
        keyStore,
        key: KeyStorePrefixes.InsightsCache(dto.orgId, `static-secret-usage:current-week:${currentWeekStartStr}`),
        ttlSeconds: KeyStoreTtls.InsightsCacheInSeconds,
        fetcher: () => insightsDAL.countSecretCreationsForOrg(dto.orgId, { createdAtOrAfter: currentWeekStart })
      })
    ]);

    const creationsByWeek = new Map(priorWeeks.map((row) => [row.weekStart, row.count]));
    creationsByWeek.set(currentWeekStartStr, createdThisWeek);

    // Weeks the org created nothing in are absent from the query, so they are filled with zero
    // here rather than being skipped, keeping the series at one entry per week.
    return {
      weeks: weekStarts.map((weekStart) => ({
        weekStart,
        totalSecrets: creationsByWeek.get(weekStart) ?? 0,
        isPartial: weekStart === currentWeekStartStr
      }))
    };
  };

  return {
    getCalendar,
    getAccessVolume,
    getOrgAccessVolume,
    getOrgAuthMethodDistribution,
    getAuthMethodDistribution,
    getSummary,
    getSecretsDuplication,
    getCounts,
    getSecretsUsageInsights,
    getSecretsProjects,
    getStaticSecretsUsage,
    getOrgSecretsCounts
  };
};
