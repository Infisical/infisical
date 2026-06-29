import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { AuditReportStatus, TAuditReport, TGetAuditReportsDTO } from "./types";

type TGetAuditReportsResponse = { reports: TAuditReport[]; totalCount: number };

export const auditReportKeys = {
  all: () => ["audit-reports"] as const,
  list: (params: TGetAuditReportsDTO) => [...auditReportKeys.all(), "list", params] as const
};

// While any report is still generating, poll so the dashboard reflects status transitions in near real time.
const IN_FLIGHT_STATUSES = [AuditReportStatus.Pending, AuditReportStatus.Processing];
const POLL_INTERVAL_MS = 5_000;

export const useGetAuditReports = (
  params: TGetAuditReportsDTO,
  options?: Omit<
    UseQueryOptions<
      TGetAuditReportsResponse,
      unknown,
      TGetAuditReportsResponse,
      ReturnType<typeof auditReportKeys.list>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: auditReportKeys.list(params),
    queryFn: async () => {
      const { data } = await apiRequest.get<TGetAuditReportsResponse>("/api/v1/audit-reports", {
        params
      });
      return data;
    },
    refetchInterval: (query) => {
      const hasInFlight = query.state.data?.reports.some((report) =>
        IN_FLIGHT_STATUSES.includes(report.status)
      );
      return hasInFlight ? POLL_INTERVAL_MS : false;
    },
    ...options
  });
};
