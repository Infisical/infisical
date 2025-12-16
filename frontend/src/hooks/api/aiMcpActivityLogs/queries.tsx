import { useInfiniteQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { onRequestError } from "@app/hooks/api/reactQuery";
import { TReactQueryOptions } from "@app/types/reactQuery";

import { TAiMcpActivityLog, TListAiMcpActivityLogsFilter } from "./types";

export const aiMcpActivityLogKeys = {
  all: ["aiMcpActivityLogs"] as const,
  list: (projectId: string, filters: TListAiMcpActivityLogsFilter) =>
    [...aiMcpActivityLogKeys.all, "list", projectId, filters] as const
};

export const useListAiMcpActivityLogs = (
  filters: TListAiMcpActivityLogsFilter,
  options: TReactQueryOptions["options"] = {}
) => {
  return useInfiniteQuery({
    initialPageParam: 0,
    queryKey: aiMcpActivityLogKeys.list(filters.projectId, filters),
    queryFn: async ({ pageParam }) => {
      try {
        const { data } = await apiRequest.get<{ activityLogs: TAiMcpActivityLog[] }>(
          "/api/v1/ai/mcp-activity-logs",
          {
            params: {
              projectId: filters.projectId,
              offset: pageParam,
              limit: filters.limit,
              startDate: filters.startDate.toISOString(),
              endDate: filters.endDate.toISOString(),
              ...(filters.endpointName ? { endpointName: filters.endpointName } : {}),
              ...(filters.serverName ? { serverName: filters.serverName } : {}),
              ...(filters.toolName ? { toolName: filters.toolName } : {}),
              ...(filters.actor ? { actor: filters.actor } : {})
            }
          }
        );
        return data.activityLogs;
      } catch (error) {
        onRequestError(error);
        return [];
      }
    },
    getNextPageParam: (lastPage, pages) =>
      lastPage.length !== 0 ? pages.length * filters.limit : undefined,
    placeholderData: (prev) => prev,
    enabled: Boolean(filters.projectId),
    ...options
  });
};
