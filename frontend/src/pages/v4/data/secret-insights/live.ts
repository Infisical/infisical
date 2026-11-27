import { useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { useGetServerConfig } from "@app/hooks/api/admin/queries";
import {
  useDeleteAuditReport,
  useGetAuditReports,
  useGetOrgAuditReports,
  useRequestAuditReport,
  useRequestOrgAuditReport
} from "@app/hooks/api/auditReports";
import { useEnableSecretBlindIndex } from "@app/hooks/api/projects/mutations";
import {
  useEnableOrgSecretValueTracking,
  useGetAuthMethodDistribution,
  useGetCalendarInsights,
  useGetInsightsSummary,
  useGetOrgAuthMethodDistribution,
  useGetOrgSecretsAccessVolume,
  useGetOrgSecretsDuplication,
  useGetOrgSecretsProjects,
  useGetOrgSecretsSummary,
  useGetOrgSecretValueTrackingStatus,
  useGetOrgStaticSecretsUsage,
  useGetSecretAccessVolume,
  useGetSecretBlindIndexStatus,
  useGetSecretsDuplication,
  useGetUnusedAccess,
  useGetUnusedAccessActor
} from "@app/hooks/api/secretInsights";
import { secretInsightsKeys, useGetInsightsCounts } from "@app/hooks/api/secretInsights/queries";
import { useGetOrgSubscription } from "@app/hooks/api/subscriptions/queries";

import type { SecretInsightsAdapter } from "./contract";

const SETTLED_INDEX_STATUSES = new Set(["completed", "failed", "not-found"]);

export const secretInsightsLive: SecretInsightsAdapter = {
  useSubscription: (orgId) => useGetOrgSubscription({ orgID: orgId }),
  useIsAuditLogAnalyticsEnabled: () =>
    Boolean(useGetServerConfig().data?.isClickhouseAuditLogEnabled),

  useCounts: (projectId, options) => useGetInsightsCounts({ projectId }, options),
  useSummary: (dto) =>
    useGetInsightsSummary(dto, {
      enabled: Boolean(dto.projectId),
      placeholderData: (previous) => previous
    }),
  useCalendar: (dto) => useGetCalendarInsights(dto, { enabled: Boolean(dto.projectId) }),
  useAccessVolume: (projectId) =>
    useGetSecretAccessVolume({ projectId }, { enabled: Boolean(projectId) }),
  useAuthMethodDistribution: (dto) =>
    useGetAuthMethodDistribution(dto, { enabled: Boolean(dto.projectId) }),
  useUnusedAccess: (dto) => useGetUnusedAccess(dto, { enabled: Boolean(dto.projectId) }),
  useUnusedAccessActor: (dto, options) => useGetUnusedAccessActor(dto, options),
  useSecretsDuplication: (projectId) =>
    useGetSecretsDuplication({ projectId }, { enabled: Boolean(projectId) }),
  useBlindIndexStatus: (projectId, options) =>
    useGetSecretBlindIndexStatus(
      { projectId },
      {
        enabled: options?.enabled,
        refetchInterval: (query) =>
          SETTLED_INDEX_STATUSES.has(query.state.data?.status ?? "") ? false : 2000
      }
    ),
  useEnableBlindIndex: () => {
    const queryClient = useQueryClient();
    const enable = useEnableSecretBlindIndex();
    return {
      isPending: enable.isPending,
      mutateAsync: async (variables) => {
        const result = await enable.mutateAsync(variables);
        await queryClient.invalidateQueries({
          queryKey: secretInsightsKeys.blindIndexStatus(variables)
        });
        return result;
      }
    };
  },
  useRefreshSecretsDuplication: () => {
    const queryClient = useQueryClient();
    return (projectId) =>
      queryClient.invalidateQueries({
        queryKey: secretInsightsKeys.secretsDuplication({ projectId })
      });
  },
  useAuditReports: (dto, options) => useGetAuditReports(dto, options),
  useRequestAuditReport,
  useDeleteAuditReport,

  useOrgSummary: useGetOrgSecretsSummary,
  useOrgProjects: (orgId, options) => {
    const query = useGetOrgSecretsProjects(orgId, { limit: 100 }, options);
    const data = useMemo(() => {
      if (!query.data) return undefined;
      const lastPage = query.data.pages[query.data.pages.length - 1];
      const seen = new Set<string>();
      const projects = query.data.pages
        .flatMap((page) => page.projects)
        .filter((project) => {
          if (seen.has(project.projectId)) return false;
          seen.add(project.projectId);
          return true;
        });
      return { ...lastPage, projects };
    }, [query.data]);
    return {
      data,
      isPending: query.isPending,
      error: query.error,
      hasMore: query.hasNextPage,
      loadMore: () => {
        query.fetchNextPage();
      },
      isLoadingMore: query.isFetchingNextPage
    };
  },
  useOrgAuthMethods: useGetOrgAuthMethodDistribution,
  useOrgStaticSecrets: useGetOrgStaticSecretsUsage,
  useOrgAccessVolume: useGetOrgSecretsAccessVolume,
  useOrgDuplication: useGetOrgSecretsDuplication,
  useOrgValueTrackingStatus: useGetOrgSecretValueTrackingStatus,
  useEnableOrgValueTracking: useEnableOrgSecretValueTracking,
  useOrgAuditReports: (dto, options) => useGetOrgAuditReports(dto, options),
  useRequestOrgAuditReport
};
