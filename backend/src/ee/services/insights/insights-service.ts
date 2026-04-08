import { ForbiddenError } from "@casl/ability";
import geoip from "geoip-lite";

import { ActionProjectType, IdentityAuthMethod } from "@app/db/schemas";
import { EventType, TAuditLogServiceFactory } from "@app/ee/services/audit-log/audit-log-types";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectPermissionInsightsActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { TSecretRotationV2DALFactory } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-dal";
import { BadRequestError } from "@app/lib/errors";
import { OrgServiceActor } from "@app/lib/types";
import { TProjectBotServiceFactory } from "@app/services/project-bot/project-bot-service";
import { TReminderDALFactory } from "@app/services/reminder/reminder-dal";
import { TSecretFolderDALFactory } from "@app/services/secret-folder/secret-folder-dal";
import { TSecretV2BridgeDALFactory } from "@app/services/secret-v2-bridge/secret-v2-bridge-dal";

import {
  TGetAccessLocationsDTO,
  TGetAccessVolumeDTO,
  TGetAuthMethodDistributionDTO,
  TGetInsightsCalendarDTO,
  TGetInsightsSummaryDTO
} from "./insights-types";

type TInsightsServiceFactoryDep = {
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  auditLogService: Pick<TAuditLogServiceFactory, "listAuditLogs">;
  secretRotationV2DAL: Pick<TSecretRotationV2DALFactory, "findByProjectAndDateRange" | "findByProject">;
  reminderDAL: Pick<TReminderDALFactory, "findByProjectAndDateRange">;
  folderDAL: Pick<TSecretFolderDALFactory, "findSecretPathByFolderIds">;
  secretV2BridgeDAL: Pick<TSecretV2BridgeDALFactory, "findStaleByProject">;
  projectBotService: Pick<TProjectBotServiceFactory, "getBotKey">;
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
  projectId: string,
  actor: OrgServiceActor
) => {
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
  auditLogService,
  secretRotationV2DAL,
  reminderDAL,
  folderDAL,
  secretV2BridgeDAL,
  projectBotService
}: TInsightsServiceFactoryDep) => {
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
    await checkInsightsPermission(permissionService, dto.projectId, actorDto);

    const { shouldUseSecretV2Bridge } = await projectBotService.getBotKey(dto.projectId);
    if (!shouldUseSecretV2Bridge) throw new BadRequestError({ message: "Project version not supported" });

    const startDate = new Date(Date.UTC(dto.year, dto.month - 1, 1));
    const endDate = new Date(Date.UTC(dto.year, dto.month, 0, 23, 59, 59, 999));

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
  };

  const getAccessVolume = async (dto: TGetAccessVolumeDTO, actorDto: OrgServiceActor) => {
    await checkInsightsPermission(permissionService, dto.projectId, actorDto);

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const endDate = new Date(`${todayStr}T23:59:59.999Z`);
    const startDate = new Date(`${todayStr}T00:00:00.000Z`);
    startDate.setUTCDate(startDate.getUTCDate() - 6);

    const auditLogs = await auditLogService.listAuditLogs({
      filter: {
        projectId: dto.projectId,
        eventType: VALUE_EVENT_TYPES,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        limit: 9999
      },
      actorId: actorDto.id,
      actorOrgId: actorDto.orgId,
      actorAuthMethod: actorDto.authMethod,
      actor: actorDto.type
    });

    const dayMap = new Map<string, Map<string, { name: string; type: string; count: number }>>();

    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date(`${todayStr}T00:00:00.000Z`);
      d.setUTCDate(d.getUTCDate() - i);
      const key = d.toISOString().slice(0, 10);
      dayMap.set(key, new Map());
    }

    auditLogs.forEach((log) => {
      const dateKey = log.createdAt.toISOString().slice(0, 10);
      const actorMap = dayMap.get(dateKey);
      if (!actorMap) return;

      const actorMeta = log.actor.metadata as Record<string, string> | null;
      const actorName = actorMeta?.email || actorMeta?.name || actorMeta?.identityId || actorMeta?.userId || "Unknown";
      const actorKey = `${log.actor.type}:${actorName}`;

      const existing = actorMap.get(actorKey);
      if (existing) {
        existing.count += 1;
      } else {
        actorMap.set(actorKey, { name: actorName, type: log.actor.type, count: 1 });
      }
    });

    const days = Array.from(dayMap.entries()).map(([date, actorMap]) => {
      const actors = Array.from(actorMap.values()).sort((a, b) => b.count - a.count);
      const total = actors.reduce((sum, a) => sum + a.count, 0);
      return { date, total, actors };
    });

    return { days };
  };

  const getAccessLocations = async (dto: TGetAccessLocationsDTO, actorDto: OrgServiceActor) => {
    await checkInsightsPermission(permissionService, dto.projectId, actorDto);

    const endDate = new Date();
    const startDate = new Date();
    startDate.setUTCDate(startDate.getUTCDate() - dto.days);

    const auditLogs = await auditLogService.listAuditLogs({
      filter: {
        projectId: dto.projectId,
        eventType: VALUE_EVENT_TYPES,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        limit: 9999
      },
      actorId: actorDto.id,
      actorOrgId: actorDto.orgId,
      actorAuthMethod: actorDto.authMethod,
      actor: actorDto.type
    });

    const ipCounts = new Map<string, number>();
    auditLogs.forEach((log) => {
      const ip = (log as { ipAddress?: string | null }).ipAddress;
      if (ip) {
        ipCounts.set(ip, (ipCounts.get(ip) || 0) + 1);
      }
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
      ip.startsWith("172.2") ||
      ip.startsWith("172.30.") ||
      ip.startsWith("172.31.") ||
      ip.startsWith("192.168.");

    ipCounts.forEach((count, ip) => {
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
  };

  const getAuthMethodDistribution = async (dto: TGetAuthMethodDistributionDTO, actorDto: OrgServiceActor) => {
    await checkInsightsPermission(permissionService, dto.projectId, actorDto);

    const endDate = new Date();
    const startDate = new Date();
    startDate.setUTCDate(startDate.getUTCDate() - dto.days);

    const auditLogs = await auditLogService.listAuditLogs({
      filter: {
        projectId: dto.projectId,
        eventType: VALUE_EVENT_TYPES,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        limit: 10000
      },
      actorId: actorDto.id,
      actorOrgId: actorDto.orgId,
      actorAuthMethod: actorDto.authMethod,
      actor: actorDto.type
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

    auditLogs.forEach((log) => {
      const actorMeta = log.actor.metadata as Record<string, unknown> | null;
      let method = "Unknown";

      if (log.actor.type === "user") {
        const raw = (actorMeta?.authMethod as string) || "Unknown";
        method = authMethodLabels[raw] || raw;
      } else if (log.actor.type === "identity") {
        const identityAuth = actorMeta?.authMethod as IdentityAuthMethod | undefined;
        method = identityAuth ? identityAuthMethodLabels[identityAuth] || identityAuth : "Unknown";
      } else if (log.actor.type === "service") {
        method = "Service Token";
      } else {
        method = log.actor.type;
      }

      methodCounts.set(method, (methodCounts.get(method) || 0) + 1);
    });

    const methods = Array.from(methodCounts.entries())
      .map(([method, count]) => ({ method, count }))
      .sort((a, b) => b.count - a.count);

    return { methods };
  };

  const getSummary = async (dto: TGetInsightsSummaryDTO, actorDto: OrgServiceActor) => {
    await checkInsightsPermission(permissionService, dto.projectId, actorDto);

    const { shouldUseSecretV2Bridge } = await projectBotService.getBotKey(dto.projectId);
    if (!shouldUseSecretV2Bridge) throw new BadRequestError({ message: "Project version not supported" });

    const now = new Date();
    const in7Days = new Date(now);
    in7Days.setDate(now.getDate() + 7);
    const staleThreshold = new Date(now);
    staleThreshold.setDate(now.getDate() - 90);

    // Fetch upcoming rotations (by date range) and all failed rotations (no date filter) in parallel
    const [upcomingRotationsRaw, allProjectRotations, reminders] = await Promise.all([
      secretRotationV2DAL.findByProjectAndDateRange({
        projectId: dto.projectId,
        startDate: new Date(0),
        endDate: in7Days
      }),
      secretRotationV2DAL.findByProject(dto.projectId),
      fetchReminders(dto.projectId, new Date(0), in7Days)
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

    // Failed rotations with nextRotationAt set also count as upcoming (will be re-attempted)
    const upcomingIds = new Set(upcomingRotationsRaw.map((r) => r.id));
    const failedWithRetry = allProjectRotations.filter(
      (r) => r.rotationStatus === "failed" && r.nextRotationAt && !upcomingIds.has(r.id)
    );
    const upcomingRotations = [...upcomingRotationsRaw, ...failedWithRetry].map(mapRotation);

    const failedRotations = allProjectRotations.filter((r) => r.rotationStatus === "failed").map(mapRotation);
    const upcomingReminders = reminders.filter((r) => new Date(r.nextReminderDate) >= now).map(mapReminder);
    const overdueReminders = reminders.filter((r) => new Date(r.nextReminderDate) < now).map(mapReminder);

    const rawStaleSecrets = await secretV2BridgeDAL.findStaleByProject(dto.projectId, staleThreshold);

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
      staleSecrets
    };
  };

  return {
    getCalendar,
    getAccessVolume,
    getAccessLocations,
    getAuthMethodDistribution,
    getSummary
  };
};
