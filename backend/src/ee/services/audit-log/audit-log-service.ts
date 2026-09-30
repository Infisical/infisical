import { ForbiddenError } from "@casl/ability";
import { requestContext } from "@fastify/request-context";

import { ActionProjectType, OrganizationActionScope, TUsers } from "@app/db/schemas";
import { KeyStorePrefixes, KeyStoreTtls, TKeyStoreFactory } from "@app/keystore/keystore";
import { getConfig } from "@app/lib/config/env";
import { generateCacheKeyFromData } from "@app/lib/crypto/cache";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { RequestContextKey } from "@app/lib/request-context/request-context-keys";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";
import { ActorAuthMethod, ActorType } from "@app/services/auth/auth-type";
import { TNotificationServiceFactory } from "@app/services/notification/notification-service";
import { NotificationType } from "@app/services/notification/notification-types";
import { SmtpTemplates, TSmtpService } from "@app/services/smtp/smtp-service";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { OrgPermissionAuditLogsActions, OrgPermissionSubjects } from "../permission/org-permission";
import { TPermissionServiceFactory } from "../permission/permission-service-types";
import { ProjectPermissionAuditLogsActions, ProjectPermissionSub } from "../permission/project-permission";
import { TClickHouseAuditLogDALFactory } from "./audit-log-clickhouse-dal";
import { TAuditLogDALFactory, TPamAuditLogScope } from "./audit-log-dal";
import { getAuditLogEventClass, getEventTypesForClasses } from "./audit-log-event-classes";
import { TAuditLogQueueServiceFactory } from "./audit-log-queue";
import { isAuditLogEventEnabled, TAuditLogSettingsServiceFactory } from "./audit-log-settings-service";
import {
  ACTOR_TYPE_TO_METADATA_ID_KEY,
  EventType,
  TAuditLogPermissionDeniedFlushJobData,
  TAuditLogServiceFactory
} from "./audit-log-types";

const AUDIT_LOG_ROW_WARNING_THRESHOLD = 350_000_000;
const AUDIT_LOG_ALERT_ROW_INCREMENT = 10_000_000;
const PERMISSION_DENIED_COLLAPSE_WINDOW_SECONDS = 60;
const PERMISSION_DENIED_COUNT_TTL_SECONDS = PERMISSION_DENIED_COLLAPSE_WINDOW_SECONDS * 10;

type TAuditLogServiceFactoryDep = {
  auditLogDAL: TAuditLogDALFactory;
  clickhouseAuditLogDAL?: TClickHouseAuditLogDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission" | "getOrgPermission">;
  auditLogQueue: TAuditLogQueueServiceFactory;
  auditLogSettingsService: Pick<TAuditLogSettingsServiceFactory, "getEffectiveSettings">;
  queueService: Pick<TQueueServiceFactory, "queue" | "start">;
  keyStore: Pick<
    TKeyStoreFactory,
    "getItem" | "setItemWithExpiry" | "setItemWithExpiryNX" | "incrementByWithExpiry" | "deleteItem"
  >;
  smtpService: Pick<TSmtpService, "sendMail">;
  userDAL: Pick<TUserDALFactory, "getUsersByFilter">;
  notificationService: Pick<TNotificationServiceFactory, "createUserNotifications">;
  resolvePamAuditScope?: (args: {
    projectId: string;
    actor: ActorType;
    actorId: string;
    actorAuthMethod: ActorAuthMethod;
    actorOrgId: string;
  }) => Promise<TPamAuditLogScope | null>;
};

export const auditLogServiceFactory = ({
  auditLogDAL,
  clickhouseAuditLogDAL,
  auditLogQueue,
  auditLogSettingsService,
  permissionService,
  queueService,
  keyStore,
  smtpService,
  userDAL,
  notificationService,
  resolvePamAuditScope
}: TAuditLogServiceFactoryDep): TAuditLogServiceFactory => {
  const listAuditLogs: TAuditLogServiceFactory["listAuditLogs"] = async ({
    actorAuthMethod,
    actorId,
    actorOrgId,
    actor,
    filter
  }) => {
    // Products with their own permission model (e.g. PAM) scope logs by resource
    let pamScope: TPamAuditLogScope | null = null;

    // Filter logs for specific project
    if (filter.projectId) {
      pamScope = resolvePamAuditScope
        ? await resolvePamAuditScope({
            projectId: filter.projectId,
            actor,
            actorId,
            actorAuthMethod,
            actorOrgId
          })
        : null;

      if (!pamScope) {
        const { permission } = await permissionService.getProjectPermission({
          actor,
          actorId,
          projectId: filter.projectId,
          actorAuthMethod,
          actorOrgId,
          actionProjectType: ActionProjectType.Any
        });
        ForbiddenError.from(permission).throwUnlessCan(
          ProjectPermissionAuditLogsActions.Read,
          ProjectPermissionSub.AuditLogs
        );
      }
    } else {
      // Organization-wide logs
      const { permission } = await permissionService.getOrgPermission({
        scope: OrganizationActionScope.Any,
        actor,
        actorId,
        orgId: actorOrgId,
        actorAuthMethod,
        actorOrgId
      });

      ForbiddenError.from(permission).throwUnlessCan(
        OrgPermissionAuditLogsActions.Read,
        OrgPermissionSubjects.AuditLogs
      );
    }

    if (filter.auditLogActorId && filter.actorType && !ACTOR_TYPE_TO_METADATA_ID_KEY[filter.actorType]) {
      throw new BadRequestError({
        message: `Actor type '${filter.actorType}' does not support filtering by actor ID`
      });
    }

    const appCfg = getConfig();
    const useClickHouse = appCfg.CLICKHOUSE_AUDIT_LOG_ENABLED && clickhouseAuditLogDAL;

    let { eventType } = filter;
    if (filter.eventClass?.length) {
      const classEventTypes = getEventTypesForClasses(filter.eventClass);
      eventType = eventType?.length ? eventType.filter((type) => classEventTypes.includes(type)) : classEventTypes;
      if (!eventType.length) return [];
    }

    const findArgs = {
      startDate: filter.startDate,
      endDate: filter.endDate,
      limit: filter.limit,
      offset: filter.offset,
      eventType,
      userAgentType: filter.userAgentType,
      actorId: filter.auditLogActorId,
      actorType: filter.actorType,
      eventMetadata: filter.eventMetadata,
      secretPath: filter.secretPath,
      secretKey: filter.secretKey,
      environment: filter.environment,
      orgId: actorOrgId,
      ...(filter.projectId ? { projectId: filter.projectId } : {}),
      ...(pamScope ? { pamScope } : {})
    };

    // If ClickHouse querying is enabled and available, use it instead of Postgres
    let auditLogs;
    if (useClickHouse) {
      logger.debug("Querying audit logs from ClickHouse");
      auditLogs = await clickhouseAuditLogDAL.find(findArgs);
    } else {
      auditLogs = await auditLogDAL.find(findArgs);
    }

    return auditLogs.map(({ eventType: logEventType, actor: eActor, actorMetadata, eventMetadata, ...el }) => ({
      ...el,
      updatedAt: el.createdAt,
      expiresAt: el.expiresAt,
      event: { type: logEventType, metadata: eventMetadata },
      eventClass: getAuditLogEventClass(logEventType),
      actor: { type: eActor, metadata: actorMetadata }
    }));
  };

  const createAuditLog: TAuditLogServiceFactory["createAuditLog"] = async (data) => {
    const appCfg = getConfig();
    if (appCfg.DISABLE_AUDIT_LOG_GENERATION) {
      return;
    }
    // Events that don't require projectId or orgId (login events where org context may not be available)
    if (data.event.type !== EventType.LOGIN_IDENTITY_UNIVERSAL_AUTH) {
      if (!data.projectId && !data.orgId)
        throw new BadRequestError({ message: "Must specify either project id or org id" });
    }
    const el = { ...data };
    if (el.actor.type === ActorType.USER || el.actor.type === ActorType.IDENTITY) {
      const permissionMetadata = requestContext.get(RequestContextKey.IdentityPermissionMetadata);
      el.actor.metadata.permission = permissionMetadata;
    }
    return auditLogQueue.pushToLog(el);
  };

  // Runs when a collapse window closes. Pushes straight to the log rather than through
  // createAuditLog: we're outside a request here, and the payload already carries the actor's
  // permission metadata from the first denial.
  const flushPermissionDeniedRepeats = async ({
    collapseKey,
    windowStart,
    windowEnd,
    orgId,
    projectId,
    metadata,
    ...auditLogInfo
  }: TAuditLogPermissionDeniedFlushJobData) => {
    const countKey = KeyStorePrefixes.AuditLogPermissionDeniedCount(collapseKey);
    const suppressedRepeats = Number(await keyStore.getItem(countKey)) || 0;
    if (!suppressedRepeats) return;
    await keyStore.deleteItem(countKey);

    await auditLogQueue.pushToLog({
      ...auditLogInfo,
      orgId,
      projectId,
      event: {
        type: EventType.PERMISSION_DENIED,
        metadata: { ...metadata, suppressedRepeats, suppressedFrom: windowStart, suppressedUntil: windowEnd }
      }
    });
  };

  queueService.start(QueueName.AuditLogPermissionDeniedFlush, async (job) => {
    await flushPermissionDeniedRepeats(job.data);
  });

  // Called from the onError hook, so it must never throw or slow the response. The first denial
  // per key is written right away and opens a one minute window; repeats just bump a counter
  // that the flush job turns into a summary event.
  const recordPermissionDenied: TAuditLogServiceFactory["recordPermissionDenied"] = async ({
    orgId,
    projectId,
    metadata,
    ...auditLogInfo
  }) => {
    const appCfg = getConfig();
    if (appCfg.DISABLE_AUDIT_LOG_GENERATION) return;

    try {
      const settings = await auditLogSettingsService.getEffectiveSettings(orgId);
      if (!settings?.shouldUseNewPrivilegeSystem) return;

      if (!isAuditLogEventEnabled(settings, EventType.PERMISSION_DENIED, projectId)) return;

      const actorIdKey = ACTOR_TYPE_TO_METADATA_ID_KEY[auditLogInfo.actor.type];
      const actorId = actorIdKey ? (auditLogInfo.actor.metadata as Record<string, unknown>)[actorIdKey] : undefined;
      const collapseKey = generateCacheKeyFromData([
        orgId,
        projectId ?? null,
        actorId ?? null,
        metadata.permissionAction ?? null,
        metadata.permissionSubject ?? null,
        metadata.route ?? null,
        metadata.method
      ]);

      const acquired = await keyStore.setItemWithExpiryNX(
        KeyStorePrefixes.AuditLogPermissionDeniedWindow(collapseKey),
        PERMISSION_DENIED_COLLAPSE_WINDOW_SECONDS,
        "1"
      );
      if (!acquired) {
        await keyStore.incrementByWithExpiry(
          KeyStorePrefixes.AuditLogPermissionDeniedCount(collapseKey),
          1,
          PERMISSION_DENIED_COUNT_TTL_SECONDS
        );
        return;
      }

      await createAuditLog({
        ...auditLogInfo,
        orgId,
        projectId,
        event: { type: EventType.PERMISSION_DENIED, metadata }
      });

      const windowStart = new Date();
      const windowEnd = new Date(windowStart.getTime() + PERMISSION_DENIED_COLLAPSE_WINDOW_SECONDS * 1000);
      await queueService.queue(
        QueueName.AuditLogPermissionDeniedFlush,
        QueueJobs.AuditLogPermissionDeniedFlush,
        {
          ...auditLogInfo,
          orgId,
          projectId,
          metadata,
          collapseKey,
          windowStart: windowStart.toISOString(),
          windowEnd: windowEnd.toISOString()
        },
        {
          jobId: `permission-denied-${collapseKey}-${windowStart.getTime()}`,
          delay: PERMISSION_DENIED_COLLAPSE_WINDOW_SECONDS * 1000,
          removeOnComplete: true,
          removeOnFail: true
        }
      );
    } catch (error) {
      logger.warn(error, `audit-log: failed to record permission denial [orgId=${orgId}] [route=${metadata.route}]`);
    }
  };

  const getAuditLogPostgresStorageStatus: TAuditLogServiceFactory["getAuditLogPostgresStorageStatus"] = async ({
    actorAuthMethod,
    actorId,
    actorOrgId,
    actor
  }) => {
    const { permission } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.Any,
      actor,
      actorId,
      orgId: actorOrgId,
      actorAuthMethod,
      actorOrgId
    });

    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionAuditLogsActions.Read, OrgPermissionSubjects.AuditLogs);

    const appCfg = getConfig();
    const clickHouseConfigured = Boolean(appCfg.isClickHouseConfigured && appCfg.CLICKHOUSE_AUDIT_LOG_ENABLED);
    const auditLogGenerationDisabled = Boolean(appCfg.DISABLE_AUDIT_LOG_GENERATION);
    const postgresAuditLogStorageDisabled = Boolean(appCfg.DISABLE_POSTGRES_AUDIT_LOG_STORAGE);
    const auditLogRowCount = await auditLogDAL.getApproximateRowCount();

    return {
      clickHouseConfigured,
      auditLogGenerationDisabled,
      auditLogStorageDisabled: postgresAuditLogStorageDisabled,
      auditLogRowCount
    };
  };

  const checkPostgresAuditLogVolumeMigrationAlert = async () => {
    const appCfg = getConfig();
    const isClickHouseConfigured = appCfg.isClickHouseConfigured && appCfg.CLICKHOUSE_AUDIT_LOG_ENABLED;
    if (
      isClickHouseConfigured ||
      appCfg.isCloud ||
      appCfg.DISABLE_AUDIT_LOG_GENERATION ||
      appCfg.DISABLE_POSTGRES_AUDIT_LOG_STORAGE
    )
      return;

    const rowCount: number = await auditLogDAL.getApproximateRowCount();

    if (rowCount < AUDIT_LOG_ROW_WARNING_THRESHOLD) return;

    const lastAlertedRowCountStr: string | null = await keyStore.getItem(KeyStorePrefixes.AuditLogMigrationAlert);
    const lastAlertedRowCount = lastAlertedRowCountStr ? Number(lastAlertedRowCountStr) : 0;

    if (lastAlertedRowCount > 0 && rowCount < lastAlertedRowCount + AUDIT_LOG_ALERT_ROW_INCREMENT) return;

    logger.info(
      `checkPostgresAuditLogVolumeMigrationAlert: alert triggered (rowCount=${rowCount}, lastAlerted=${lastAlertedRowCount})`
    );

    const superAdminsResult: { users: TUsers[]; total: number } = await userDAL.getUsersByFilter({
      limit: 1000,
      offset: 0,
      searchTerm: "",
      adminsOnly: true
    });

    if (superAdminsResult.users.length === 0) {
      await keyStore.setItemWithExpiry(
        KeyStorePrefixes.AuditLogMigrationAlert,
        KeyStoreTtls.AuditLogMigrationAlertInSeconds,
        String(rowCount)
      );
      return;
    }

    const adminsWithEmail = superAdminsResult.users.filter((admin): admin is TUsers & { email: string } =>
      Boolean(admin.email)
    );

    if (adminsWithEmail.length > 0) {
      const recipientEmails = [...new Set(adminsWithEmail.map((admin) => admin.email))];
      try {
        await smtpService.sendMail({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          template: SmtpTemplates.AuditLogMigrationAlert,
          subjectLine: "Action recommended: Optimize your audit log storage",
          recipients: recipientEmails,
          substitutions: {
            siteUrl: appCfg.SITE_URL
          }
        });
      } catch (error) {
        logger.error(error, "Failed to send audit log migration alert email");
      }
    }

    await notificationService
      .createUserNotifications(
        superAdminsResult.users.map((admin: TUsers) => ({
          userId: admin.id,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          type: NotificationType.AUDIT_LOG_MIGRATION_RECOMMENDED,
          title: "Optimize your audit log storage",
          body: "Your audit log volume is growing. To keep searches fast and reduce database load, we recommend streaming logs to an external destination like Splunk or using the built-in ClickHouse integration."
        }))
      )
      .catch((error) => {
        logger.error(error, "Failed to create audit log migration alert notifications");
      });

    await keyStore.setItemWithExpiry(
      KeyStorePrefixes.AuditLogMigrationAlert,
      KeyStoreTtls.AuditLogMigrationAlertInSeconds,
      String(rowCount)
    );
    logger.info(`checkPostgresAuditLogVolumeMigrationAlert: alert sent to super admins (rowCount=${rowCount})`);
  };

  return {
    createAuditLog,
    recordPermissionDenied,
    listAuditLogs,
    getAuditLogPostgresStorageStatus,
    checkPostgresAuditLogVolumeMigrationAlert
  };
};
