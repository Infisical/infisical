import type {
  TAuditReport,
  TDeleteAuditReportDTO,
  TGetAuditReportsDTO,
  TGetOrgAuditReportsDTO,
  TOrgAuditReport,
  TRequestAuditReportDTO,
  TRequestOrgAuditReportDTO
} from "@app/hooks/api/auditReports/types";
import type {
  TGetAuthMethodDistributionDTO,
  TGetAuthMethodDistributionResponse,
  TGetCalendarInsightsDTO,
  TGetCalendarInsightsResponse,
  TGetInsightsCountsResponse,
  TGetInsightsSummaryDTO,
  TGetInsightsSummaryResponse,
  TGetOrgSecretsDuplicationResponse,
  TGetOrgSecretValueTrackingStatusResponse,
  TGetSecretAccessVolumeResponse,
  TGetSecretBlindIndexStatusResponse,
  TGetSecretsDuplicationResponse,
  TGetUnusedAccessActorDTO,
  TGetUnusedAccessActorResponse,
  TGetUnusedAccessDTO,
  TGetUnusedAccessResponse,
  TOrgAuthMethodUsage,
  TOrgProjectsInsights,
  TOrgSecretAccessVolume,
  TOrgSecretsSummary,
  TOrgStaticSecretUsage
} from "@app/hooks/api/secretInsights/types";
import type { SubscriptionPlan } from "@app/hooks/api/types";

import type { V4Mutation, V4QueryResult } from "../contract";

type Enabled = { enabled?: boolean };
export type InsightsReports<TReport> = { reports: TReport[]; totalCount: number };

export type OrgProjectsInsightsResult = V4QueryResult<TOrgProjectsInsights> & {
  hasMore: boolean;
  loadMore: () => void;
  isLoadingMore: boolean;
};

export type SecretInsightsAdapter = {
  useSubscription: (orgId: string) => V4QueryResult<SubscriptionPlan>;
  useIsAuditLogAnalyticsEnabled: () => boolean;

  useCounts: (projectId: string, options?: Enabled) => V4QueryResult<TGetInsightsCountsResponse>;
  useSummary: (dto: TGetInsightsSummaryDTO) => V4QueryResult<TGetInsightsSummaryResponse>;
  useCalendar: (dto: TGetCalendarInsightsDTO) => V4QueryResult<TGetCalendarInsightsResponse>;
  useAccessVolume: (projectId: string) => V4QueryResult<TGetSecretAccessVolumeResponse>;
  useAuthMethodDistribution: (
    dto: TGetAuthMethodDistributionDTO
  ) => V4QueryResult<TGetAuthMethodDistributionResponse>;
  useUnusedAccess: (dto: TGetUnusedAccessDTO) => V4QueryResult<TGetUnusedAccessResponse>;
  useUnusedAccessActor: (
    dto: TGetUnusedAccessActorDTO,
    options?: Enabled
  ) => V4QueryResult<TGetUnusedAccessActorResponse>;
  useSecretsDuplication: (projectId: string) => V4QueryResult<TGetSecretsDuplicationResponse>;
  /** Polls every 2 seconds until the indexing run settles. */
  useBlindIndexStatus: (
    projectId: string,
    options?: Enabled
  ) => V4QueryResult<TGetSecretBlindIndexStatusResponse>;
  useEnableBlindIndex: V4Mutation<{ projectId: string }>;
  /** Refetches the duplicates once indexing completes. */
  useRefreshSecretsDuplication: () => (projectId: string) => void;
  /** Polls while a report is still generating. */
  useAuditReports: (
    dto: TGetAuditReportsDTO,
    options?: Enabled
  ) => V4QueryResult<InsightsReports<TAuditReport>>;
  useRequestAuditReport: V4Mutation<TRequestAuditReportDTO>;
  useDeleteAuditReport: V4Mutation<TDeleteAuditReportDTO>;

  useOrgSummary: (orgId: string, options?: Enabled) => V4QueryResult<TOrgSecretsSummary>;
  /** Pages of 100 projects, merged and deduplicated across pages. */
  useOrgProjects: (orgId: string, options?: Enabled) => OrgProjectsInsightsResult;
  useOrgAuthMethods: (orgId: string, options?: Enabled) => V4QueryResult<TOrgAuthMethodUsage>;
  useOrgStaticSecrets: (orgId: string, options?: Enabled) => V4QueryResult<TOrgStaticSecretUsage>;
  useOrgAccessVolume: (orgId: string, options?: Enabled) => V4QueryResult<TOrgSecretAccessVolume>;
  useOrgDuplication: (
    orgId: string,
    options?: Enabled
  ) => V4QueryResult<TGetOrgSecretsDuplicationResponse>;
  /** Polls every 2 seconds while tracking is being enabled. */
  useOrgValueTrackingStatus: (
    orgId: string,
    options?: Enabled
  ) => V4QueryResult<TGetOrgSecretValueTrackingStatusResponse>;
  useEnableOrgValueTracking: V4Mutation<{ orgId: string }>;
  /** Polls while a report is still generating. */
  useOrgAuditReports: (
    dto: TGetOrgAuditReportsDTO,
    options?: Enabled
  ) => V4QueryResult<InsightsReports<TOrgAuditReport>>;
  useRequestOrgAuditReport: V4Mutation<TRequestOrgAuditReportDTO>;
};
