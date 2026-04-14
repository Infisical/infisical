import { ForbiddenError } from "@casl/ability";
import { requestContext } from "@fastify/request-context";

import { ActionProjectType, OrganizationActionScope, TUsers } from "@app/db/schemas";
import { TKeyStoreFactory } from "@app/keystore/keystore";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { RequestContextKey } from "@app/lib/request-context/request-context-keys";
import { ActorType } from "@app/services/auth/auth-type";
import { TNotificationServiceFactory } from "@app/services/notification/notification-service";
import { NotificationType } from "@app/services/notification/notification-types";
import { SmtpTemplates, TSmtpService } from "@app/services/smtp/smtp-service";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { OrgPermissionAuditLogsActions, OrgPermissionSubjects } from "../permission/org-permission";
import { TPermissionServiceFactory } from "../permission/permission-service-types";
import { ProjectPermissionAuditLogsActions, ProjectPermissionSub } from "../permission/project-permission";
import { TClickHouseAuditLogDALFactory } from "./audit-log-clickhouse-dal";
import { TAuditLogDALFactory } from "./audit-log-dal";
import { TAuditLogQueueServiceFactory } from "./audit-log-queue";
import { ACTOR_TYPE_TO_METADATA_ID_KEY, EventType, TAuditLogServiceFactory } from "./audit-log-types";

const AUDIT_LOG_ROW_WARNING_THRESHOLD = 350_000_000;
const AUDIT_LOG_ALERT_ROW_INCREMENT = 10_000_000;
const AUDIT_LOG_MIGRATION_ALERT_STATE_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

type TAuditLogServiceFactoryDep = {
  auditLogDAL: TAuditLogDALFactory;
  clickhouseAuditLogDAL?: TClickHouseAuditLogDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission" | "getOrgPermission">;
  auditLogQueue: TAuditLogQueueServiceFactory;
  keyStore: Pick<TKeyStoreFactory, "getItem" | "setItemWithExpiry">;
  smtpService: Pick<TSmtpService, "sendMail">;
  userDAL: Pick<TUserDALFactory, "getUsersByFilter">;
  notificationService: Pick<TNotificationServiceFactory, "createUserNotifications">;
};

export const auditLogServiceFactory = ({
  auditLogDAL,
  clickhouseAuditLogDAL,
  auditLogQueue,
  permissionService,
  keyStore,
  smtpService,
  userDAL,
  notificationService
}: TAuditLogServiceFactoryDep): TAuditLogServiceFactory => {
  const listAuditLogs: TAuditLogServiceFactory["listAuditLogs"] = async ({
    actorAuthMethod,
    actorId,
    actorOrgId,
    actor,
    filter
  }) => {
    // Filter logs for specific project
    if (filter.projectId) {
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

    const findArgs = {
      startDate: filter.startDate,
      endDate: filter.endDate,
      limit: filter.limit,
      offset: filter.offset,
      eventType: filter.eventType,
      userAgentType: filter.userAgentType,
      actorId: filter.auditLogActorId,
      actorType: filter.actorType,
      eventMetadata: filter.eventMetadata,
      secretPath: filter.secretPath,
      secretKey: filter.secretKey,
      environment: filter.environment,
      orgId: actorOrgId,
      ...(filter.projectId ? { projectId: filter.projectId } : {})
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

    const lastAlertedRowCountStr: string | null = await keyStore.getItem("audit-log-migration-alert-last-row-count");
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
        "audit-log-migration-alert-last-row-count",
        AUDIT_LOG_MIGRATION_ALERT_STATE_TTL_SECONDS,
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
      "audit-log-migration-alert-last-row-count",
      AUDIT_LOG_MIGRATION_ALERT_STATE_TTL_SECONDS,
      String(rowCount)
    );
    logger.info(`checkPostgresAuditLogVolumeMigrationAlert: alert sent to super admins (rowCount=${rowCount})`);
  };

  return {
    createAuditLog,
    listAuditLogs,
    getAuditLogPostgresStorageStatus,
    checkPostgresAuditLogVolumeMigrationAlert
  };
};
