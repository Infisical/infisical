import { useInfiniteQuery, UseInfiniteQueryOptions, useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { Actor, AuditLog, TGetAuditLogsFilter } from "./types";

export const auditLogKeys = {
  getAuditLogs: (workspaceId: string | null, filters: TGetAuditLogsFilter) =>
    [{ workspaceId, filters }, "audit-logs"] as const,
  getAuditLogActorFilterOpts: (workspaceId: string) =>
    [{ workspaceId }, "audit-log-actor-filters"] as const
};

export const useGetAuditLogs = (
  filters: TGetAuditLogsFilter,
  projectId: string | null,
  options: Omit<
    UseInfiniteQueryOptions<
      AuditLog[],
      unknown,
      AuditLog[],
      AuditLog[],
      ReturnType<typeof auditLogKeys.getAuditLogs>
    >,
    "queryFn" | "queryKey" | "getNextPageParam"
  > = {}
) => {
  return useInfiniteQuery({
    queryKey: auditLogKeys.getAuditLogs(projectId, filters),
    queryFn: async ({ pageParam }) => {
      const { data } = await apiRequest.get<{ auditLogs: AuditLog[] }>(
        "/api/v1/organization/audit-logs",
        {
          params: {
            ...filters,
            offset: pageParam,
            startDate: filters?.startDate?.toISOString(),
            endDate: filters?.endDate?.toISOString(),
            ...(filters.eventMetadata && Object.keys(filters.eventMetadata).length
              ? {
                  eventMetadata: Object.entries(filters.eventMetadata)
                    .map(([key, value]) => `${key}=${value}`)
                    .join(",")
                }
              : {}),
            ...(filters.eventType?.length ? { eventType: filters.eventType.join(",") } : {}),
            ...(projectId ? { projectId } : {})
          }
        }
      );
      return data.auditLogs;
    },
    getNextPageParam: (lastPage, pages) =>
      lastPage.length !== 0 ? pages.length * filters.limit : undefined,
    ...options
  });
};

export const useGetAuditLogActorFilterOpts = (workspaceId: string) => {
  return useQuery({
    queryKey: auditLogKeys.getAuditLogActorFilterOpts(workspaceId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ actors: Actor[] }>(
        `/api/v1/workspace/${workspaceId}/audit-logs/filters/actors`
      );
      return data.actors;
    }
  });
};
