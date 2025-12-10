import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TAiMcpActivityLog, TListAiMcpActivityLogsDTO } from "./types";

export const aiMcpActivityLogKeys = {
  all: ["aiMcpActivityLogs"] as const,
  list: (projectId: string) => [...aiMcpActivityLogKeys.all, "list", projectId] as const
};

export const useListAiMcpActivityLogs = ({ projectId }: TListAiMcpActivityLogsDTO) => {
  return useQuery({
    queryKey: aiMcpActivityLogKeys.list(projectId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TAiMcpActivityLog[]>("/api/v1/ai/mcp-activity-logs", {
        params: { projectId }
      });
      return data;
    },
    enabled: Boolean(projectId)
  });
};
