import { useEffect, useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { FileTextIcon, LockIcon } from "lucide-react";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { OrgPermissionCan } from "@app/components/permissions";
import { PageHeader } from "@app/components/v2";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Skeleton,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@app/components/v3";
import {
  OrgPermissionSubjects,
  useOrganization,
  useServerConfig,
  useSubscription
} from "@app/context";
import { OrgPermissionSecretsManagementInsightsActions } from "@app/context/OrgPermissionContext/types";
import { withPermission } from "@app/hoc";
import { usePopUp } from "@app/hooks";
import {
  AuditReportStatus,
  TOrgAuthMethodUsage,
  TOrgProjectsInsights,
  TOrgSecretAccessVolume,
  TOrgSecretsSummary,
  TOrgStaticSecretUsage,
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

// Every insights endpoint is gated on the same entitlement, so without it there is nothing to
// fetch. The cards render from these zeroed payloads and fall back to their own empty states, so
// the page keeps its shape behind the upgrade prompt instead of collapsing to a blank screen.
const PLAN_LOCKED_SUMMARY: TOrgSecretsSummary = { activeLeases: 0, users: 0, identities: 0 };
const PLAN_LOCKED_PROJECTS: TOrgProjectsInsights = {
  projects: [],
  totalProjects: 0,
  projectsWithIssues: 0,
  offset: 0,
  limit: 0
};
const PLAN_LOCKED_AUTH_METHODS: TOrgAuthMethodUsage = { totalFetches: 0, methods: [] };
const PLAN_LOCKED_STATIC_SECRETS: TOrgStaticSecretUsage = { weeks: [] };
const PLAN_LOCKED_ACCESS_VOLUME: TOrgSecretAccessVolume = { days: [] };

export const SecretInsightsPage = withPermission(
  () => {
    const { currentOrg } = useOrganization();
    const { config } = useServerConfig();
    const { subscription } = useSubscription();
    const isClickhouseEnabled = Boolean(config.isClickhouseAuditLogEnabled);
    const hasInsightsPlan = Boolean(subscription?.secretAccessInsights);

    const { data: summary, isPending: isSummaryPending } = useGetOrgSecretsSummary(currentOrg.id, {
      enabled: hasInsightsPlan
    });
    const {
      data: projectsPages,
      isPending: isProjectsPending,
      hasNextPage: hasMoreProjects,
      fetchNextPage: fetchMoreProjects,
      isFetchingNextPage: isFetchingMoreProjects
    } = useGetOrgSecretsProjects(currentOrg.id, { limit: 100 }, { enabled: hasInsightsPlan });

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
      useGetOrgAuthMethodDistribution(currentOrg.id, {
        enabled: isClickhouseEnabled && hasInsightsPlan
      });
    const { data: staticSecretUsage, isPending: isStaticSecretsPending } =
      useGetOrgStaticSecretsUsage(currentOrg.id, { enabled: hasInsightsPlan });
    const { data: accessVolume, isPending: isAccessVolumePending } = useGetOrgSecretsAccessVolume(
      currentOrg.id,
      { enabled: isClickhouseEnabled && hasInsightsPlan }
    );

    const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
      "requestOrgReport",
      "upgradePlan"
    ] as const);
    // Reports are generated asynchronously and delivered by email; the list is newest-first
    // and polls while a report is in flight (the backend allows one in-flight report per org).
    const { data: orgReports } = useGetOrgAuditReports(
      { offset: 0, limit: 10 },
      { enabled: hasInsightsPlan }
    );
    const lastSentReport = orgReports?.reports.find((report) =>
      SENT_REPORT_STATUSES.includes(report.status)
    );
    const hasInFlightReport = Boolean(
      orgReports?.reports.some((report) => IN_FLIGHT_REPORT_STATUSES.includes(report.status))
    );

    useEffect(() => {
      if (subscription && !subscription.secretAccessInsights) {
        handlePopUpOpen("upgradePlan");
      }
    }, [subscription]);

    const isSummaryLoading = hasInsightsPlan && isSummaryPending;
    const isProjectsLoading = hasInsightsPlan && isProjectsPending;
    const isStaticSecretsLoading = hasInsightsPlan && isStaticSecretsPending;
    const isAuthMethodsLoading = isClickhouseEnabled && hasInsightsPlan && isAuthMethodsPending;
    const isAccessVolumeLoading = isClickhouseEnabled && hasInsightsPlan && isAccessVolumePending;

    const summaryData = hasInsightsPlan ? summary : PLAN_LOCKED_SUMMARY;
    const projectsData = hasInsightsPlan ? projectsInsights : PLAN_LOCKED_PROJECTS;
    const staticSecretData = hasInsightsPlan ? staticSecretUsage : PLAN_LOCKED_STATIC_SECRETS;
    const authMethodData = hasInsightsPlan ? authMethodUsage : PLAN_LOCKED_AUTH_METHODS;
    const accessVolumeData = hasInsightsPlan ? accessVolume : PLAN_LOCKED_ACCESS_VOLUME;

    const showAuthMethodsSlot =
      isAuthMethodsLoading || (isClickhouseEnabled && Boolean(authMethodData));

    return (
      <>
        <>
          <title>Secret Insights | Infisical</title>
          <link rel="icon" href="/infisical.ico" />
        </>
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
                        onClick={() =>
                          handlePopUpOpen(hasInsightsPlan ? "requestOrgReport" : "upgradePlan")
                        }
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
              {!hasInsightsPlan && (
                <Alert variant="info">
                  <LockIcon />
                  <AlertTitle>Insights Is Not Included in Your Current Plan</AlertTitle>
                  <AlertDescription>
                    <p>
                      Secret health, access volume, and authentication data stay empty until you
                      upgrade. Go to{" "}
                      <Link
                        to="/organizations/$orgId/billing"
                        params={{ orgId: currentOrg.id }}
                        className="inline underline hover:opacity-80"
                      >
                        Billing
                      </Link>{" "}
                      to change your plan.
                    </p>
                  </AlertDescription>
                </Alert>
              )}
              {isSummaryLoading && (
                <div className="grid gap-4 md:grid-cols-3">
                  <Skeleton className="h-[150px]" />
                  <Skeleton className="h-[150px]" />
                  <Skeleton className="h-[150px]" />
                </div>
              )}
              {!isSummaryLoading && summaryData && <SummaryCard summary={summaryData} />}
              {isProjectsLoading && <Skeleton className="h-[320px]" />}
              {!isProjectsLoading && projectsData && (
                <InsightsCard
                  data={projectsData}
                  hasMore={hasMoreProjects}
                  onLoadMore={fetchMoreProjects}
                  isLoadingMore={isFetchingMoreProjects}
                  isPlanRestricted={!hasInsightsPlan}
                />
              )}
              <div
                className={
                  showAuthMethodsSlot ? "grid gap-4 xl:grid-cols-[1fr_1.35fr]" : "grid gap-4"
                }
              >
                {isAuthMethodsLoading && <Skeleton className="h-[320px]" />}
                {!isAuthMethodsLoading && isClickhouseEnabled && authMethodData && (
                  <AuthMethodsCard data={authMethodData} />
                )}
                {isStaticSecretsLoading && <Skeleton className="h-[320px]" />}
                {!isStaticSecretsLoading && staticSecretData && (
                  <StaticSecretPresenceCard data={staticSecretData} />
                )}
              </div>
              {isAccessVolumeLoading && <Skeleton className="h-[300px]" />}
              {!isAccessVolumeLoading && isClickhouseEnabled && accessVolumeData && (
                <SecretAccessVolumeCard data={accessVolumeData} />
              )}
            </div>
          </div>
        </div>
        <RequestOrgAuditReportModal
          isOpen={popUp.requestOrgReport.isOpen}
          onOpenChange={(isOpen) => handlePopUpToggle("requestOrgReport", isOpen)}
          isAuditLogSupported={isClickhouseEnabled}
        />
        <UpgradePlanModal
          isOpen={popUp.upgradePlan.isOpen}
          onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
          text="Your current plan does not include access to secret insights. To unlock this feature, please upgrade your Infisical plan."
        />
      </>
    );
  },
  {
    action: OrgPermissionSecretsManagementInsightsActions.Read,
    subject: OrgPermissionSubjects.SecretsManagementInsights
  }
);
