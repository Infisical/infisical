import { ForbiddenError } from "@casl/ability";
import { requestContext } from "@fastify/request-context";

import { ActionProjectType, OrganizationActionScope, TUsers } from "@app/db/schemas";
import { TKeyStoreFactory } from "@app/keystore/keystore";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
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

const AUDIT_LOG_ROW_WARNING_THRESHOLD = 300_000_000;
const AUDIT_LOG_ALERT_ROW_INCREMENT = 10_000_000;

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
      const permissionMetadata = requestContext.get("identityPermissionMetadata");
      el.actor.metadata.permission = permissionMetadata;
    }
    return auditLogQueue.pushToLog(el);
  };

  const getAuditLogMigrationStatus = async () => {
    const appCfg = getConfig();
    const clickHouseConfigured = Boolean(appCfg.isClickHouseConfigured && appCfg.CLICKHOUSE_AUDIT_LOG_ENABLED);
    const auditLogGenerationDisabled = Boolean(appCfg.DISABLE_AUDIT_LOG_GENERATION);
    const auditLogStorageDisabled = Boolean(appCfg.DISABLE_AUDIT_LOG_STORAGE);
    const auditLogRowCount = await auditLogDAL.getApproximateRowCount();

    return {
      clickHouseConfigured,
      auditLogGenerationDisabled,
      auditLogStorageDisabled,
      auditLogRowCount
    };
  };

  const checkClickHouseMigrationAlert = async () => {
    const appCfg = getConfig();
    const isClickHouseConfigured = appCfg.isClickHouseConfigured && appCfg.CLICKHOUSE_AUDIT_LOG_ENABLED;
    if (isClickHouseConfigured) return;

    const rowCount: number = await auditLogDAL.getApproximateRowCount();

    if (rowCount < AUDIT_LOG_ROW_WARNING_THRESHOLD) return;

    const lastAlertedAt: string | null = await keyStore.getItem("audit-log-migration-alert-last-row-count");
    const lastAlertedRowCount = lastAlertedAt ? Number(lastAlertedAt) : 0;

    if (lastAlertedRowCount > 0 && rowCount < lastAlertedRowCount + AUDIT_LOG_ALERT_ROW_INCREMENT) return;

    logger.info(
      `checkClickHouseMigrationAlert: alert triggered (rowCount=${rowCount}, lastAlerted=${lastAlertedRowCount})`
    );

    const superAdminsResult: { users: TUsers[]; total: number } = await userDAL.getUsersByFilter({
      limit: 1000,
      offset: 0,
      searchTerm: "",
      adminsOnly: true
    });

    const adminsWithEmail = superAdminsResult.users.filter((admin): admin is TUsers & { email: string } =>
      Boolean(admin.email)
    );
    if (adminsWithEmail.length === 0) return;

    const emailResults = await Promise.allSettled(
      adminsWithEmail.map((admin) =>
        smtpService.sendMail({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          template: SmtpTemplates.AuditLogMigrationAlert,
          subjectLine: "Action recommended: Audit log storage is large",
          recipients: [admin.email],
          substitutions: {
            siteUrl: appCfg.SITE_URL
          }
        })
      )
    );

    const failedEmails = emailResults.filter((r) => r.status === "rejected");
    if (failedEmails.length > 0) {
      logger.error({ failedCount: failedEmails.length }, "Failed to send some audit log migration alert emails");
    }

    await notificationService
      .createUserNotifications(
        superAdminsResult.users.map((admin: TUsers) => ({
          userId: admin.id,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          type: NotificationType.AUDIT_LOG_MIGRATION_RECOMMENDED,
          title: "Audit log migration recommended",
          body: "Your audit log table has grown large. Consider configuring ClickHouse as your audit log storage backend to maintain query performance.",
          link: "/admin/audit-logs"
        }))
      )
      .catch((error) => {
        logger.error(error, "Failed to create audit log migration alert notifications");
      });

    await keyStore.setItemWithExpiry("audit-log-migration-alert-last-row-count", 31536000, String(rowCount));
    logger.info(`checkClickHouseMigrationAlert: alert sent to super admins (rowCount=${rowCount})`);
  };

  return {
    createAuditLog,
    listAuditLogs,
    getAuditLogMigrationStatus,
    checkClickHouseMigrationAlert
  };
};
