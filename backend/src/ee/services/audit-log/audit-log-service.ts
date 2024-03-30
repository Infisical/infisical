import { ForbiddenError } from "@casl/ability";

import { BadRequestError } from "@app/lib/errors";

import { TPermissionServiceFactory } from "../permission/permission-service";
import { ProjectPermissionActions, ProjectPermissionSub } from "../permission/project-permission";
import { TAuditLogDALFactory } from "./audit-log-dal";
import { TAuditLogQueueServiceFactory } from "./audit-log-queue";
import { EventType, TCreateAuditLogDTO, TListProjectAuditLogDTO } from "./audit-log-types";

type TAuditLogServiceFactoryDep = {
  auditLogDAL: TAuditLogDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  auditLogQueue: TAuditLogQueueServiceFactory;
};

export type TAuditLogServiceFactory = ReturnType<typeof auditLogServiceFactory>;

export const auditLogServiceFactory = ({
  auditLogDAL,
  auditLogQueue,
  permissionService
}: TAuditLogServiceFactoryDep) => {
  const listProjectAuditLogs = async ({
    userAgentType,
    eventType,
    offset,
    limit,
    endDate,
    startDate,
    actor,
    actorId,
    actorOrgId,
    projectId,
    auditLogActor
  }: TListProjectAuditLogDTO) => {
    const { permission } = await permissionService.getProjectPermission(actor, actorId, projectId, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.AuditLogs);
    const auditLogs = await auditLogDAL.find({
      startDate,
      endDate,
      limit,
      offset,
      eventType,
      userAgentType,
      actor: auditLogActor,
      projectId
    });
    return auditLogs.map(({ eventType: logEventType, actor: eActor, actorMetadata, eventMetadata, ...el }) => ({
      ...el,
      event: { type: logEventType, metadata: eventMetadata },
      actor: { type: eActor, metadata: actorMetadata }
    }));
  };

  const createAuditLog = async (data: TCreateAuditLogDTO) => {
    // add all cases in which project id or org id cannot be added
    if (data.event.type !== EventType.LOGIN_IDENTITY_UNIVERSAL_AUTH) {
      if (!data.projectId && !data.orgId) throw new BadRequestError({ message: "Must either project id or org id" });
    }

    return auditLogQueue.pushToLog(data);
  };

  return {
    createAuditLog,
    listProjectAuditLogs
  };
};
