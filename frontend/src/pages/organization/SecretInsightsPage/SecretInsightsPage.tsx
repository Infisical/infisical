import { useMemo } from "react";
import { Helmet } from "react-helmet";
import { format } from "date-fns";
import { FileTextIcon } from "lucide-react";

import { OrgPermissionCan } from "@app/components/permissions";
import { PageHeader } from "@app/components/v2";
import {
  Button,
  Skeleton,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@app/components/v3";
import { OrgPermissionSubjects, useOrganization, useServerConfig } from "@app/context";
import { OrgPermissionSecretsManagementInsightsActions } from "@app/context/OrgPermissionContext/types";
import { withPermission } from "@app/hoc";
import { usePopUp } from "@app/hooks";
import {
  AuditReportStatus,
  useGetOrgAuditReports,
  useGetOrgAuthMethodDistribution,
  useGetOrgSecretsAccessVolume,
  useGetOrgSecretsProjects,
  useGetOrgSecretsSummary,
  useGetOrgStaticSecretsUsage
} from "@app/hooks/api";
import { ProjectType } from "@app/hooks/api/projects/types";

import {
  AuthMethodsCard,
  InsightsCard,
  RequestOrgAuditReportModal,
  SecretAccessVolumeCard,
  StaticSecretPresenceCard,
  SummaryCard
} from "./components";

const SENT_REPORT_STATUSES = [AuditReportStatus.Completed, AuditReportStatus.Partial];
const IN_FLIGHT_REPORT_STATUSES = [AuditReportStatus.Pending, AuditReportStatus.Processing];

export const SecretInsightsPage = withPermission(
  () => {
    const { currentOrg } = useOrganization();
    const { config } = useServerConfig();
    const isClickhouseEnabled = Boolean(config.isClickhouseAuditLogEnabled);

    const { data: summary, isPending: isSummaryPending } = useGetOrgSecretsSummary(currentOrg.id);
    const {
      data: projectsPages,
      isPending: isProjectsPending,
      hasNextPage: hasMoreProjects,
      fetchNextPage: fetchMoreProjects,
      isFetchingNextPage: isFetchingMoreProjects
    } = useGetOrgSecretsProjects(currentOrg.id, { limit: 100 });

    const projectsInsights = useMemo(() => {
      if (!projectsPages) return undefined;
      const lastPage = projectsPages.pages[projectsPages.pages.length - 1];
      // Dedupe across pages: rows can shift between fetches while the server cache refreshes
      const seen = new Set<string>();
      const projects = projectsPages.pages
        .flatMap((page) => page.projects)
        .filter((project) => {
          if (seen.has(project.projectId)) return false;
          seen.add(project.projectId);
          return true;
        });
      return {
        projects,
        totalProjects: lastPage.totalProjects,
        projectsWithIssues: lastPage.projectsWithIssues,
        offset: lastPage.offset,
        limit: lastPage.limit
      };
    }, [projectsPages]);
    const { data: authMethodUsage, isPending: isAuthMethodsPending } =
      useGetOrgAuthMethodDistribution(currentOrg.id, { enabled: isClickhouseEnabled });
    const { data: staticSecretUsage, isPending: isStaticSecretsPending } =
      useGetOrgStaticSecretsUsage(currentOrg.id);
    const { data: accessVolume, isPending: isAccessVolumePending } = useGetOrgSecretsAccessVolume(
      currentOrg.id,
      { enabled: isClickhouseEnabled }
    );

    const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["requestOrgReport"] as const);
    // Reports are generated asynchronously and delivered by email; the list is newest-first
    // and polls while a report is in flight (the backend allows one in-flight report per org).
    const { data: orgReports } = useGetOrgAuditReports({ offset: 0, limit: 10 });
    const lastSentReport = orgReports?.reports.find((report) =>
      SENT_REPORT_STATUSES.includes(report.status)
    );
    const hasInFlightReport = Boolean(
      orgReports?.reports.some((report) => IN_FLIGHT_REPORT_STATUSES.includes(report.status))
    );

    const isAuthMethodsLoading = isClickhouseEnabled && isAuthMethodsPending;
    const isAccessVolumeLoading = isClickhouseEnabled && isAccessVolumePending;
    const showAuthMethodsSlot = isAuthMethodsLoading || Boolean(authMethodUsage);

    return (
      <>
        <Helmet>
          <title>Secret Insights | Infisical</title>
          <link rel="icon" href="/infisical.ico" />
        </Helmet>
        <div className="h-full">
          <div className="mx-auto h-full w-full max-w-8xl bg-bunker-800 text-white">
            <PageHeader
              className="mb-4 dashboard:mb-10"
              scope={ProjectType.SecretManager}
              title="Insights"
              description="Organization-wide visibility into secret health, access patterns, and authentication hygiene."
            >
              <div className="flex items-center gap-3">
                {lastSentReport && (
                  <span className="flex items-center gap-1.5 text-xs whitespace-nowrap text-mineshaft-300">
                    <FileTextIcon className="size-3.5" />
                    Last report sent {format(new Date(lastSentReport.createdAt), "MMM d, yyyy")}
                  </span>
                )}
                <OrgPermissionCan
                  I={OrgPermissionSecretsManagementInsightsActions.GenerateReport}
                  a={OrgPermissionSubjects.SecretsManagementInsights}
                >
                  {(isAllowed) => {
                    const generateButton = (
                      <Button
                        variant="project"
                        size="xs"
                        isDisabled={!isAllowed || hasInFlightReport}
                        onClick={() => handlePopUpOpen("requestOrgReport")}
                      >
                        Generate Report
                      </Button>
                    );
                    if (!hasInFlightReport) return generateButton;
                    return (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex">{generateButton}</span>
                          </TooltipTrigger>
                          <TooltipContent>
                            A report is already being generated. Please wait for it to finish.
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    );
                  }}
                </OrgPermissionCan>
              </div>
            </PageHeader>
            <div className="flex flex-col gap-4 pb-8">
              {isSummaryPending && (
                <div className="grid gap-4 md:grid-cols-3">
                  <Skeleton className="h-[150px]" />
                  <Skeleton className="h-[150px]" />
                  <Skeleton className="h-[150px]" />
                </div>
              )}
              {!isSummaryPending && summary && <SummaryCard summary={summary} />}
              {isProjectsPending && <Skeleton className="h-[320px]" />}
              {!isProjectsPending && projectsInsights && (
                <InsightsCard
                  data={projectsInsights}
                  hasMore={hasMoreProjects}
                  onLoadMore={fetchMoreProjects}
                  isLoadingMore={isFetchingMoreProjects}
                />
              )}
              <div
                className={
                  showAuthMethodsSlot ? "grid gap-4 xl:grid-cols-[1fr_1.35fr]" : "grid gap-4"
                }
              >
                {isAuthMethodsLoading && <Skeleton className="h-[320px]" />}
                {!isAuthMethodsLoading && authMethodUsage && (
                  <AuthMethodsCard data={authMethodUsage} />
                )}
                {isStaticSecretsPending && <Skeleton className="h-[320px]" />}
                {!isStaticSecretsPending && staticSecretUsage && (
                  <StaticSecretPresenceCard data={staticSecretUsage} />
                )}
              </div>
              {isAccessVolumeLoading && <Skeleton className="h-[300px]" />}
              {!isAccessVolumeLoading && accessVolume && (
                <SecretAccessVolumeCard data={accessVolume} />
              )}
            </div>
          </div>
        </div>
        <RequestOrgAuditReportModal
          isOpen={popUp.requestOrgReport.isOpen}
          onOpenChange={(isOpen) => handlePopUpToggle("requestOrgReport", isOpen)}
          isAuditLogSupported={isClickhouseEnabled}
        />
      </>
    );
  },
  {
    action: OrgPermissionSecretsManagementInsightsActions.Read,
    subject: OrgPermissionSubjects.SecretsManagementInsights
  }
);
