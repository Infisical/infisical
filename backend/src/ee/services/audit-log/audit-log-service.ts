import { ForbiddenError } from "@casl/ability";

import { getConfig } from "@app/lib/config/env";
import { BadRequestError } from "@app/lib/errors";

import { OrgPermissionActions, OrgPermissionSubjects } from "../permission/org-permission";
import { TPermissionServiceFactory } from "../permission/permission-service";
import { ProjectPermissionActions, ProjectPermissionSub } from "../permission/project-permission";
import { TAuditLogDALFactory } from "./audit-log-dal";
import { TAuditLogQueueServiceFactory } from "./audit-log-queue";
import { EventType, TCreateAuditLogDTO, TListProjectAuditLogDTO } from "./audit-log-types";

type TAuditLogServiceFactoryDep = {
  auditLogDAL: TAuditLogDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission" | "getOrgPermission">;
  auditLogQueue: TAuditLogQueueServiceFactory;
};

export type TAuditLogServiceFactory = ReturnType<typeof auditLogServiceFactory>;

export const auditLogServiceFactory = ({
  auditLogDAL,
  auditLogQueue,
  permissionService
}: TAuditLogServiceFactoryDep) => {
  const listAuditLogs = async ({ actorAuthMethod, actorId, actorOrgId, actor, filter }: TListProjectAuditLogDTO) => {
    // Filter logs for specific project
    if (filter.projectId) {
      const { permission } = await permissionService.getProjectPermission(
        actor,
        actorId,
        filter.projectId,
        actorAuthMethod,
        actorOrgId
      );
      ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.AuditLogs);
    } else {
      // Organization-wide logs
      const { permission } = await permissionService.getOrgPermission(
        actor,
        actorId,
        actorOrgId,
        actorAuthMethod,
        actorOrgId
      );

      /**
       * NOTE (dangtony98): Update this to organization-level audit log permission check once audit logs are moved
       * to the organization level ✅
       */
      ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.AuditLogs);
    }

    // If project ID is not provided, then we need to return all the audit logs for the organization itself.
    const auditLogs = await auditLogDAL.find({
      startDate: filter.startDate,
      endDate: filter.endDate,
      limit: filter.limit,
      offset: filter.offset,
      eventType: filter.eventType,
      userAgentType: filter.userAgentType,
      actorId: filter.auditLogActorId,
      actorType: filter.actorType,
      eventMetadata: filter.eventMetadata,
      ...(filter.projectId ? { projectId: filter.projectId } : { orgId: actorOrgId })
    });

    return auditLogs.map(({ eventType: logEventType, actor: eActor, actorMetadata, eventMetadata, ...el }) => ({
      ...el,
      event: { type: logEventType, metadata: eventMetadata },
      actor: { type: eActor, metadata: actorMetadata }
    }));
  };

  const createAuditLog = async (data: TCreateAuditLogDTO) => {
    const appCfg = getConfig();
    if (appCfg.DISABLE_AUDIT_LOG_GENERATION) {
      return;
    }
    // add all cases in which project id or org id cannot be added
    if (data.event.type !== EventType.LOGIN_IDENTITY_UNIVERSAL_AUTH) {
      if (!data.projectId && !data.orgId) throw new BadRequestError({ message: "Must either project id or org id" });
    }

    return auditLogQueue.pushToLog(data);
  };

  return {
    createAuditLog,
    listAuditLogs
  };
};
