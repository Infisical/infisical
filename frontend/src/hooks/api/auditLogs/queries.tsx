import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { Actor, AuditLog, AuditLogFilters } from "./types";

export const workspaceKeys = {
  getAuditLogs: (workspaceId: string, filters: AuditLogFilters) =>
    [{ workspaceId, filters }, "audit-logs"] as const,
  getAuditLogActorFilterOpts: (workspaceId: string) =>
    [{ workspaceId }, "audit-log-actor-filters"] as const
};

export const useGetAuditLogs = (workspaceId: string, filters: AuditLogFilters) => {
  return useInfiniteQuery({
    queryKey: workspaceKeys.getAuditLogs(workspaceId, filters),
    queryFn: async ({ pageParam }) => {
      const { data } = await apiRequest.get<{ auditLogs: AuditLog[] }>(
        `/api/v1/workspace/${workspaceId}/audit-logs`,
        {
          params: {
            ...filters,
            offset: pageParam,
            startDate: filters?.startDate?.toISOString(),
            endDate: filters?.endDate?.toISOString()
          }
        }
      );
      return data.auditLogs;
    },
    getNextPageParam: (lastPage, pages) =>
      lastPage.length !== 0 ? pages.length * filters.limit : undefined
  });
};

export const useGetAuditLogActorFilterOpts = (workspaceId: string) => {
  return useQuery({
    queryKey: workspaceKeys.getAuditLogActorFilterOpts(workspaceId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ actors: Actor[] }>(
        `/api/v1/workspace/${workspaceId}/audit-logs/filters/actors`
      );
      return data.actors;
    }
  });
};
