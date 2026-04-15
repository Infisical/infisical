import { ForbiddenError } from "@casl/ability";
import geoip from "geoip-lite";

import { ActionProjectType, IdentityAuthMethod } from "@app/db/schemas";
import { TAuditLogDALFactory } from "@app/ee/services/audit-log/audit-log-dal";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectPermissionInsightsActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { TSecretRotationV2DALFactory } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-dal";
import { KeyStorePrefixes, KeyStoreTtls, TKeyStoreFactory } from "@app/keystore/keystore";
import { BadRequestError } from "@app/lib/errors";
import { OrgServiceActor } from "@app/lib/types";
import { ActorType } from "@app/services/auth/auth-type";
import { TProjectBotServiceFactory } from "@app/services/project-bot/project-bot-service";
import { TReminderDALFactory } from "@app/services/reminder/reminder-dal";
import { TSecretFolderDALFactory } from "@app/services/secret-folder/secret-folder-dal";
import { TSecretV2BridgeDALFactory } from "@app/services/secret-v2-bridge/secret-v2-bridge-dal";
import { TUserDALFactory } from "@app/services/user/user-dal";

import {
  TGetAccessLocationsDTO,
  TGetAccessVolumeDTO,
  TGetAuthMethodDistributionDTO,
  TGetInsightsCalendarDTO,
  TGetInsightsSummaryDTO
} from "./insights-types";

type TInsightsServiceFactoryDep = {
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  auditLogDAL: Pick<TAuditLogDALFactory, "countByDateAndActor" | "countByIpAddress" | "countByAuthMethod">;
  secretRotationV2DAL: Pick<TSecretRotationV2DALFactory, "findByProjectAndDateRange" | "findByProject">;
  reminderDAL: Pick<TReminderDALFactory, "findByProjectAndDateRange">;
  folderDAL: Pick<TSecretFolderDALFactory, "findSecretPathByFolderIds">;
  secretV2BridgeDAL: Pick<TSecretV2BridgeDALFactory, "findStaleByProject" | "countStaleByProject">;
  projectBotService: Pick<TProjectBotServiceFactory, "getBotKey">;
  userDAL: Pick<TUserDALFactory, "find">;
  keyStore: Pick<TKeyStoreFactory, "setItemWithExpiry" | "getItem">;
};

export type TInsightsServiceFactory = ReturnType<typeof insightsServiceFactory>;

const VALUE_EVENT_TYPES = [
  EventType.GET_SECRETS,
  EventType.GET_SECRET,
  EventType.DASHBOARD_GET_SECRET_VALUE,
  EventType.DASHBOARD_GET_SECRET_VERSION_VALUE,
  EventType.GET_SECRET_ROTATION_GENERATED_CREDENTIALS,
  EventType.CREATE_DYNAMIC_SECRET_LEASE
];

const checkInsightsPermission = async (
  permissionService: TInsightsServiceFactoryDep["permissionService"],
  licenseService: TInsightsServiceFactoryDep["licenseService"],
  projectId: string,
  actor: OrgServiceActor
) => {
  const plan = await licenseService.getPlan(actor.orgId);
  if (!plan.secretAccessInsights) {
    throw new BadRequestError({
      message: "Failed to access insights due to plan restriction. Upgrade your plan to access insights."
    });
  }

  const { permission } = await permissionService.getProjectPermission({
    actor: actor.type,
    actorId: actor.id,
    projectId,
    actorAuthMethod: actor.authMethod,
    actorOrgId: actor.orgId,
    actionProjectType: ActionProjectType.SecretManager
  });

  ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionInsightsActions.Read, ProjectPermissionSub.Insights);
};

export const insightsServiceFactory = ({
  permissionService,
  licenseService,
  auditLogDAL,
  secretRotationV2DAL,
  reminderDAL,
  folderDAL,
  secretV2BridgeDAL,
  projectBotService,
  userDAL,
  keyStore
}: TInsightsServiceFactoryDep) => {
  const withCache = async <T>(cacheKey: string, fn: () => Promise<T>): Promise<T> => {
    const cached = await keyStore.getItem(cacheKey);
    if (cached) return JSON.parse(cached) as T;

    const result = await fn();
    await keyStore.setItemWithExpiry(cacheKey, KeyStoreTtls.InsightsCacheInSeconds, JSON.stringify(result));
    return result;
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
    return withCache(cacheKey, async () => {
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
    });
  };

  const getAccessVolume = async (dto: TGetAccessVolumeDTO, actorDto: OrgServiceActor) => {
    await checkInsightsPermission(permissionService, licenseService, dto.projectId, actorDto);

    const cacheKey = KeyStorePrefixes.InsightsCache(dto.projectId, "access-volume");
    return withCache(cacheKey, async () => {
      const now = new Date();
      const todayStr = now.toISOString().slice(0, 10);
      const endDate = new Date(`${todayStr}T23:59:59.999Z`);
      const startDate = new Date(`${todayStr}T00:00:00.000Z`);
      startDate.setUTCDate(startDate.getUTCDate() - 6);

      const rows = await auditLogDAL.countByDateAndActor({
        orgId: actorDto.orgId,
        projectId: dto.projectId,
        eventTypes: VALUE_EVENT_TYPES,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString()
      });

      // Resolve user display names from userIds in audit log metadata
      const userIds = [
        ...new Set(
          rows
            .filter((r) => r.actor === ActorType.USER)
            .map((r) => (r.actorMetadata as Record<string, string> | null)?.userId)
            .filter(Boolean) as string[]
        )
      ];
      const userNameMap = new Map<string, string>();
      if (userIds.length > 0) {
        const users = await userDAL.find({ $in: { id: userIds } });
        users.forEach((u) => {
          const displayName = [u.firstName, u.lastName].filter(Boolean).join(" ");
          if (displayName) userNameMap.set(u.id, displayName);
        });
      }

      // Pre-populate the last 7 days
      const dayMap = new Map<string, Map<string, { name: string; type: string; count: number }>>();
      for (let i = 6; i >= 0; i -= 1) {
        const d = new Date(`${todayStr}T00:00:00.000Z`);
        d.setUTCDate(d.getUTCDate() - i);
        dayMap.set(d.toISOString().slice(0, 10), new Map());
      }

      rows.forEach((row) => {
        const dateKey = typeof row.date === "string" ? row.date : new Date(row.date).toISOString().slice(0, 10);
        const actorMap = dayMap.get(dateKey);
        if (!actorMap) return;

        const actorMeta = row.actorMetadata as Record<string, string> | null;
        let actorName: string;
        if (row.actor === ActorType.USER && actorMeta?.userId) {
          actorName = userNameMap.get(actorMeta.userId) || actorMeta.email || actorMeta.username || "Unknown";
        } else if (row.actor === ActorType.USER) {
          actorName = actorMeta?.email || actorMeta?.username || "Unknown";
        } else {
          actorName = actorMeta?.name || actorMeta?.identityId || "Unknown";
        }
        const actorKey = `${row.actor}:${actorName}`;

        const existing = actorMap.get(actorKey);
        if (existing) {
          existing.count += row.count;
        } else {
          actorMap.set(actorKey, { name: actorName, type: row.actor, count: row.count });
        }
      });

      const days = Array.from(dayMap.entries()).map(([date, actorMap]) => {
        const actors = Array.from(actorMap.values()).sort((a, b) => b.count - a.count);
        const total = actors.reduce((sum, a) => sum + a.count, 0);
        return { date, total, actors };
      });

      return { days };
    });
  };

  const getAccessLocations = async (dto: TGetAccessLocationsDTO, actorDto: OrgServiceActor) => {
    await checkInsightsPermission(permissionService, licenseService, dto.projectId, actorDto);

    const cacheKey = KeyStorePrefixes.InsightsCache(dto.projectId, `access-locations:${dto.days}`);
    return withCache(cacheKey, async () => {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setUTCDate(startDate.getUTCDate() - dto.days);

      const ipRows = await auditLogDAL.countByIpAddress({
        orgId: actorDto.orgId,
        projectId: dto.projectId,
        eventTypes: VALUE_EVENT_TYPES,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString()
      });

      const locationMap = new Map<string, { lat: number; lng: number; city: string; country: string; count: number }>();

      const isPrivateIp = (ip: string) =>
        ip === "127.0.0.1" ||
        ip === "::1" ||
        ip === "::ffff:127.0.0.1" ||
        ip.startsWith("10.") ||
        ip.startsWith("172.16.") ||
        ip.startsWith("172.17.") ||
        ip.startsWith("172.18.") ||
        ip.startsWith("172.19.") ||
        ip.startsWith("172.20.") ||
        ip.startsWith("172.21.") ||
        ip.startsWith("172.22.") ||
        ip.startsWith("172.23.") ||
        ip.startsWith("172.24.") ||
        ip.startsWith("172.25.") ||
        ip.startsWith("172.26.") ||
        ip.startsWith("172.27.") ||
        ip.startsWith("172.28.") ||
        ip.startsWith("172.29.") ||
        ip.startsWith("172.30.") ||
        ip.startsWith("172.31.") ||
        ip.startsWith("192.168.");

      ipRows.forEach(({ ipAddress: ip, count }) => {
        if (isPrivateIp(ip)) {
          const key = "Local Network:LOCAL";
          const existing = locationMap.get(key);
          if (existing) {
            existing.count += count;
          } else {
            locationMap.set(key, { lat: 0, lng: 0, city: "Local Network", country: "LOCAL", count });
          }
          return;
        }

        const geo = geoip.lookup(ip);
        if (!geo || !geo.ll) return;

        const city = geo.city || geo.region || "";
        const key = `${city}:${geo.country}`;
        const existing = locationMap.get(key);
        if (existing) {
          existing.count += count;
        } else {
          locationMap.set(key, {
            lat: geo.ll[0],
            lng: geo.ll[1],
            city,
            country: geo.country,
            count
          });
        }
      });

      return {
        locations: Array.from(locationMap.values()).sort((a, b) => b.count - a.count)
      };
    });
  };

  const getAuthMethodDistribution = async (dto: TGetAuthMethodDistributionDTO, actorDto: OrgServiceActor) => {
    await checkInsightsPermission(permissionService, licenseService, dto.projectId, actorDto);

    const cacheKey = KeyStorePrefixes.InsightsCache(dto.projectId, `auth-methods:${dto.days}`);
    return withCache(cacheKey, async () => {
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
    });
  };

  const getSummary = async (dto: TGetInsightsSummaryDTO, actorDto: OrgServiceActor) => {
    await checkInsightsPermission(permissionService, licenseService, dto.projectId, actorDto);

    const cacheKey = KeyStorePrefixes.InsightsCache(
      dto.projectId,
      `summary:${dto.staleSecretsOffset ?? 0}:${dto.staleSecretsLimit ?? 50}`
    );
    return withCache(cacheKey, async () => {
      const { shouldUseSecretV2Bridge } = await projectBotService.getBotKey(dto.projectId);
      if (!shouldUseSecretV2Bridge) throw new BadRequestError({ message: "Project version not supported" });

      const now = new Date();
      const in7Days = new Date(now);
      in7Days.setDate(now.getDate() + 7);
      const lookback90Days = new Date(now);
      lookback90Days.setDate(now.getDate() - 90);
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
    });
  };

  return {
    getCalendar,
    getAccessVolume,
    getAccessLocations,
    getAuthMethodDistribution,
    getSummary
  };
};
