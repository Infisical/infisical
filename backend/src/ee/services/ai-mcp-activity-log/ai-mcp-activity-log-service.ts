import { ForbiddenError } from "@casl/ability";

import { ActionProjectType, TAiMcpActivityLogsInsert } from "@app/db/schemas";
import { TProjectPermission } from "@app/lib/types";

import { TPermissionServiceFactory } from "../permission/permission-service-types";
import { ProjectPermissionActions, ProjectPermissionSub } from "../permission/project-permission";
import { TAiMcpActivityLogDALFactory } from "./ai-mcp-activity-log-dal";

export type TAiMcpActivityLogServiceFactory = ReturnType<typeof aiMcpActivityLogServiceFactory>;

export type TAiMcpActivityLogServiceFactoryDep = {
  aiMcpActivityLogDAL: TAiMcpActivityLogDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
};

export type TListActivityLogsDTO = TProjectPermission;

export const aiMcpActivityLogServiceFactory = ({
  aiMcpActivityLogDAL,
  permissionService
}: TAiMcpActivityLogServiceFactoryDep) => {
  const createActivityLog = async (activityLog: TAiMcpActivityLogsInsert) => {
    return aiMcpActivityLogDAL.create(activityLog);
  };

  const listActivityLogs = async ({ projectId, actor, actorId, actorAuthMethod, actorOrgId }: TListActivityLogsDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.AI
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.McpActivityLogs);

    return aiMcpActivityLogDAL.find({ projectId });
  };

  return {
    createActivityLog,
    listActivityLogs
  };
};
