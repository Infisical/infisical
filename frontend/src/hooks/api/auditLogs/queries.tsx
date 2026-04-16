import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { downloadFile } from "@app/helpers/download";
import { onRequestError } from "@app/hooks/api/reactQuery";
import { TReactQueryOptions } from "@app/types/reactQuery";

import { AuditLog, AuditLogPostgresStorageStatus, TGetAuditLogsFilter } from "./types";

export const auditLogKeys = {
  getAuditLogs: (projectId: string | null, filters: TGetAuditLogsFilter) =>
    [{ projectId, filters }, "audit-logs"] as const,
  postgresStorageStatus: ["audit-logs-postgres-storage-status"] as const
};

export const useGetAuditLogs = (
  filters: TGetAuditLogsFilter,
  projectId: string | null,
  options: TReactQueryOptions["options"] = {}
) => {
  return useInfiniteQuery({
    initialPageParam: 0,
    queryKey: auditLogKeys.getAuditLogs(projectId, filters),
    queryFn: async ({ pageParam }) => {
      try {
        const { data } = await apiRequest.get<{ auditLogs: AuditLog[] }>(
          "/api/v1/organization/audit-logs",
          {
            params: {
              ...filters,
              offset: pageParam,
              startDate: filters.startDate.toISOString(),
              endDate: filters.endDate.toISOString(),
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
      } catch (error) {
        onRequestError(error);
        return [];
      }
    },
    getNextPageParam: (lastPage, pages) =>
      lastPage.length !== 0 ? pages.length * filters.limit : undefined,
    placeholderData: (prev) => prev,
    ...options
  });
};

const fetchAuditLogPostgresStorageStatus = async () => {
  const { data } = await apiRequest.get<AuditLogPostgresStorageStatus>(
    "/api/v1/organization/audit-logs/postgres-storage-status"
  );
  return data;
};

export const useGetAuditLogPostgresStorageStatus = () => {
  return useQuery({
    queryKey: auditLogKeys.postgresStorageStatus,
    queryFn: fetchAuditLogPostgresStorageStatus
  });
};

export type TExportAuditLogsFilter = Omit<TGetAuditLogsFilter, "limit">;

export const exportAuditLogs = async (filters: TExportAuditLogsFilter, projectId?: string | null) => {
  const date = new Date().toISOString().split("T")[0];
  const response = await apiRequest.get<Blob>("/api/v1/organization/audit-logs/export", {
    responseType: "blob",
    params: {
      ...filters,
      startDate: filters.startDate.toISOString(),
      endDate: filters.endDate.toISOString(),
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
  });

  const text = await (response.data as Blob).text();
  downloadFile(text, `audit-logs-${date}.jsonl`, "application/x-ndjson");
};
