import { TAiMcpActivityLogsInsert } from "@app/db/schemas";

import { TAiMcpActivityLogDALFactory } from "./ai-mcp-activity-log-dal";

export type TAiMcpActivityLogServiceFactory = ReturnType<typeof aiMcpActivityLogServiceFactory>;

export type TAiMcpActivityLogServiceFactoryDep = {
  aiMcpActivityLogDAL: TAiMcpActivityLogDALFactory;
};

export const aiMcpActivityLogServiceFactory = ({ aiMcpActivityLogDAL }: TAiMcpActivityLogServiceFactoryDep) => {
  const createActivityLog = async (activityLog: TAiMcpActivityLogsInsert) => {
    return aiMcpActivityLogDAL.create(activityLog);
  };

  const listActivityLogs = async (projectId: string) => {
    return aiMcpActivityLogDAL.find({ projectId });
  };

  return {
    createActivityLog,
    listActivityLogs
  };
};
