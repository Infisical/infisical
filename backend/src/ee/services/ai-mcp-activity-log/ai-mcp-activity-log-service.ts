import { ForbiddenError } from "@casl/ability";

import { TAiMcpActivityLogsInsert } from "@app/db/schemas/ai-mcp-activity-logs";
import { ActionProjectType } from "@app/db/schemas/models";
import { TProjectPermission } from "@app/lib/types";

import { TPermissionServiceFactory } from "../permission/permission-service-types";
import { ProjectPermissionActions, ProjectPermissionSub } from "../permission/project-permission";
import { TAiMcpActivityLogDALFactory, TFindActivityLogsQuery } from "./ai-mcp-activity-log-dal";

export type TAiMcpActivityLogServiceFactory = ReturnType<typeof aiMcpActivityLogServiceFactory>;

export type TAiMcpActivityLogServiceFactoryDep = {
  aiMcpActivityLogDAL: TAiMcpActivityLogDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
};

export type TListActivityLogsFilter = {
  endpointName?: string;
  serverName?: string;
  toolName?: string;
  actor?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
};

export type TListActivityLogsDTO = TProjectPermission & {
  filter?: TListActivityLogsFilter;
};

export const aiMcpActivityLogServiceFactory = ({
  aiMcpActivityLogDAL,
  permissionService
}: TAiMcpActivityLogServiceFactoryDep) => {
  const createActivityLog = async (activityLog: TAiMcpActivityLogsInsert) => {
    return aiMcpActivityLogDAL.create(activityLog);
  };

  const listActivityLogs = async ({
    projectId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    filter
  }: TListActivityLogsDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.AI
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.McpActivityLogs);

    const query: TFindActivityLogsQuery = {
      projectId,
      ...filter
    };

    return aiMcpActivityLogDAL.find(query);
  };

  return {
    createActivityLog,
    listActivityLogs
  };
};
