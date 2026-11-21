import { type ReactNode, useCallback, useState } from "react";
import { Button } from "@infisical/cipher/ui/button";
import { Grid, Stack } from "@infisical/cipher/ui/layout";
import { Loader } from "@infisical/cipher/ui/loader";
import { PageHeader } from "@infisical/cipher/ui/page-header";
import { Skeleton } from "@infisical/cipher/ui/skeleton";
import { TooltipProvider } from "@infisical/cipher/ui/tooltip";

import { SecretAccessInsightsUpgradeIntent } from "@app/components/license/UpgradeGate/upgrade-intents";
import { PageTitle } from "@app/components/PageTitle";
import {
  OrgPermissionSecretsManagementInsightsActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { AuditReportStatus } from "@app/hooks/api/auditReports/types";

import { useOrgId, useOrgPermission } from "../../access/permissions";
import { AccessRestricted } from "../../access/ui";
import { useV4Adapter } from "../../data/adapters";
import { useUpgradeGate } from "../../license";
import { GenerateReportDialog } from "../../secret-manager/InsightsPage/shared/generate-report-dialog";
import { AccessVolumeCard } from "./components/access-volume-card";
import { AuthMethodsCard } from "./components/auth-methods-card";
import { DuplicatedSecretsCard } from "./components/duplicated-secrets-card";
import { InsightsUpgradePreview } from "./components/insights-upgrade-preview";
import { NewSecretsCard } from "./components/new-secrets-card";
import { ProjectsInsightsCard } from "./components/projects-insights-card";
import { MAX_REPORT_RECIPIENTS, reportOptions } from "./components/report-types";

const IN_FLIGHT_REPORT_STATUSES = new Set([
  AuditReportStatus.Pending,
  AuditReportStatus.Processing
]);

const generateDisabledReason = (canGenerate: boolean, hasInFlightReport: boolean) => {
  if (!canGenerate) return "You don't have permission to generate reports";
  if (hasInFlightReport) return "A report is already being generated. Wait for it to finish.";
  return undefined;
};

const loadable = <TData,>(
  query: { data: TData | undefined; isPending: boolean },
  height: number,
  render: (data: TData) => ReactNode
) => {
  if (query.isPending) return <Skeleton height={height} />;
  return query.data ? render(query.data) : null;
};

const InsightsCards = ({
  orgId,
  isAuditLogAnalyticsEnabled
}: {
  orgId: string;
  isAuditLogAnalyticsEnabled: boolean;
}) => {
  const insights = useV4Adapter("secretInsights");
  const withAnalytics = { enabled: isAuditLogAnalyticsEnabled };
  const projects = insights.useOrgProjects(orgId);
  const authMethods = insights.useOrgAuthMethods(orgId, withAnalytics);
  const staticSecrets = insights.useOrgStaticSecrets(orgId);
  const accessVolume = insights.useOrgAccessVolume(orgId, withAnalytics);
  const authMethodsCard = isAuditLogAnalyticsEnabled
    ? loadable(authMethods, 320, (data) => <AuthMethodsCard data={data} />)
    : null;

  return (
    <Stack gap={16}>
      {loadable(projects, 320, (data) => (
        <ProjectsInsightsCard
          data={data}
          hasMore={projects.hasMore}
          onLoadMore={projects.loadMore}
          isLoadingMore={projects.isLoadingMore}
        />
      ))}
      <DuplicatedSecretsCard />
      <Grid gap={16} min="card">
        {authMethodsCard}
        {loadable(staticSecrets, 320, (data) => (
          <NewSecretsCard data={data} />
        ))}
      </Grid>
      {isAuditLogAnalyticsEnabled &&
        loadable(accessVolume, 300, (data) => <AccessVolumeCard data={data} />)}
    </Stack>
  );
};

const SecretInsightsContent = ({ orgId }: { orgId: string }) => {
  const insights = useV4Adapter("secretInsights");
  const { permission } = useOrgPermission();
  const { data: subscription, isPending: isPlanPending } = insights.useSubscription(orgId);
  const isAuditLogAnalyticsEnabled = insights.useIsAuditLogAnalyticsEnabled();
  const hasPlan = Boolean(subscription?.secretAccessInsights);
  // The list is newest first and polls while a report is in flight; the backend allows one at a
  // time per organization.
  const { data: reports } = insights.useOrgAuditReports(
    { offset: 0, limit: 10 },
    { enabled: hasPlan }
  );
  const requestReport = insights.useRequestOrgAuditReport();
  const [isReportOpen, setIsReportOpen] = useState(false);
  const { openUpgradeGate, upgradeGate } = useUpgradeGate();

  const handleUpgrade = useCallback(
    () =>
      openUpgradeGate({
        intent: SecretAccessInsightsUpgradeIntent,
        paywallKey: "organization.secret-insights"
      }),
    [openUpgradeGate]
  );

  if (isPlanPending) return <Loader size="page" label="Loading insights" />;

  const hasInFlightReport = Boolean(
    reports?.reports.some((report) => IN_FLIGHT_REPORT_STATUSES.has(report.status))
  );
  const canGenerateReport = permission.can(
    OrgPermissionSecretsManagementInsightsActions.GenerateReport,
    OrgPermissionSubjects.SecretsManagementInsights
  );

  return (
    <TooltipProvider>
      <Stack gap={24}>
        <PageHeader
          title="Insights"
          actions={
            <Button
              variant="primary"
              disabledReason={generateDisabledReason(canGenerateReport, hasInFlightReport)}
              onClick={() => (hasPlan ? setIsReportOpen(true) : handleUpgrade())}
            >
              Generate Report
            </Button>
          }
        />
        {hasPlan ? (
          <InsightsCards orgId={orgId} isAuditLogAnalyticsEnabled={isAuditLogAnalyticsEnabled} />
        ) : (
          <InsightsUpgradePreview onUpgrade={handleUpgrade} />
        )}
      </Stack>
      {isReportOpen && (
        <GenerateReportDialog
          options={reportOptions(isAuditLogAnalyticsEnabled)}
          maxRecipients={MAX_REPORT_RECIPIENTS}
          onSubmit={({ types, emailRecipients }) =>
            requestReport.mutateAsync({
              reports: types.map((type) => ({ type })),
              emailRecipients
            })
          }
          onClose={() => setIsReportOpen(false)}
        />
      )}
      {upgradeGate}
    </TooltipProvider>
  );
};

const SecretInsightsGate = () => {
  const orgId = useOrgId();
  const { permission, isPending } = useOrgPermission();
  if (isPending) return <Loader size="page" label="Loading insights" />;
  if (
    !permission.can(
      OrgPermissionSecretsManagementInsightsActions.Read,
      OrgPermissionSubjects.SecretsManagementInsights
    )
  )
    return <AccessRestricted requirement="Read on Secrets Management Insights" />;
  return <SecretInsightsContent orgId={orgId} />;
};

export const SecretInsightsPage = () => (
  <>
    <PageTitle title="Secret Insights" />
    <SecretInsightsGate />
  </>
);
