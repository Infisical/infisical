import { ForbiddenError } from "@casl/ability";
import { requestContext } from "@fastify/request-context";

import { ActionProjectType, OrganizationActionScope } from "@app/db/schemas";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { ActorType } from "@app/services/auth/auth-type";

import { OrgPermissionAuditLogsActions, OrgPermissionSubjects } from "../permission/org-permission";
import { TPermissionServiceFactory } from "../permission/permission-service-types";
import { ProjectPermissionAuditLogsActions, ProjectPermissionSub } from "../permission/project-permission";
import { TClickHouseAuditLogDALFactory } from "./audit-log-clickhouse-dal";
import { TAuditLogDALFactory } from "./audit-log-dal";
import { TAuditLogQueueServiceFactory } from "./audit-log-queue";
import { EventType, TAuditLogServiceFactory } from "./audit-log-types";

type TAuditLogServiceFactoryDep = {
  auditLogDAL: TAuditLogDALFactory;
  clickhouseAuditLogDAL?: TClickHouseAuditLogDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission" | "getOrgPermission">;
  auditLogQueue: TAuditLogQueueServiceFactory;
};

export const auditLogServiceFactory = ({
  auditLogDAL,
  clickhouseAuditLogDAL,
  auditLogQueue,
  permissionService
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

    const appCfg = getConfig();
    const useClickHouse = appCfg.CLICKHOUSE_AUDIT_LOG_QUERY_ENABLED && clickhouseAuditLogDAL;

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
      expiresAt: null as Date | null,
      event: { type: logEventType, metadata: eventMetadata },
      actor: { type: eActor, metadata: actorMetadata }
    }));
  };

  const createAuditLog: TAuditLogServiceFactory["createAuditLog"] = async (data) => {
    const appCfg = getConfig();
    if (appCfg.DISABLE_AUDIT_LOG_GENERATION) {
      return;
    }
    // add all cases in which project id or org id cannot be added
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

  return {
    createAuditLog,
    listAuditLogs
  };
};
