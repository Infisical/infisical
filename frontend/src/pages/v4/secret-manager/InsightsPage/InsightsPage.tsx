import { useCallback } from "react";
import { Grid, Stack } from "@infisical/cipher/ui/layout";
import { Loader } from "@infisical/cipher/ui/loader";
import { PageHeader } from "@infisical/cipher/ui/page-header";
import { useParams } from "@tanstack/react-router";

import { SecretAccessInsightsUpgradeIntent } from "@app/components/license/UpgradeGate/upgrade-intents";
import { PageTitle } from "@app/components/PageTitle";
import {
  ProjectPermissionHoneyTokenActions,
  ProjectPermissionInsightsActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";

import { useProjectPermission } from "../../access/permissions";
import { AccessRestricted } from "../../access/ui";
import { useV4Adapter } from "../../data/adapters";
import { useUpgradeGate } from "../../license";
import { v4Path } from "../../links";
import { InsightsUpgradePreview } from "../../organization/SecretInsightsPage/components/insights-upgrade-preview";
import { AccessVolumeCard } from "./access-volume-card";
import { AuditReportsCard } from "./audit-reports-card";
import { AuthMethodCard } from "./auth-method-card";
import { CalendarCard } from "./calendar-card";
import { DuplicatedSecretsCard } from "./duplicated-secrets-card";
import { plural } from "./insights.utils";
import { InsightsSummaryCards } from "./summary-cards";
import { UnusedAccessCard } from "./unused-access-card";

const ROUTE = v4Path("/organizations/$orgId/projects/secret-management/$projectId/insights");

const Insights = () => {
  const { orgId, projectId } = useParams({ from: ROUTE });
  const insights = useV4Adapter("secretInsights");
  const { permission, isPending: isPermissionPending } = useProjectPermission(projectId);
  const { data: project } = useV4Adapter("secrets").useProject(projectId);
  const { data: subscription, isPending: isSubscriptionPending } = insights.useSubscription(orgId);
  const { openUpgradeGate, upgradeGate } = useUpgradeGate();
  const hasInsightsPlan = Boolean(subscription?.secretAccessInsights);
  const { data: counts } = insights.useCounts(projectId, { enabled: hasInsightsPlan });

  const handleUpgrade = useCallback(
    () =>
      openUpgradeGate({
        intent: SecretAccessInsightsUpgradeIntent,
        paywallKey: "secret-manager.insights"
      }),
    [openUpgradeGate]
  );

  if (isPermissionPending || isSubscriptionPending)
    return <Loader size="page" label="Loading insights" />;
  if (!permission.can(ProjectPermissionInsightsActions.Read, ProjectPermissionSub.Insights))
    return <AccessRestricted requirement="read insights" />;

  const environments = project?.environments ?? [];
  const environmentName = (slug: string) =>
    environments.find((environment) => environment.slug === slug)?.name ?? slug;
  const canReadHoneyTokens = permission.can(
    ProjectPermissionHoneyTokenActions.Read,
    ProjectPermissionSub.HoneyTokens
  );
  const statParts =
    hasInsightsPlan && counts
      ? (
          [
            [counts.secretCount, "secret"],
            [environments.length, "environment"],
            [counts.folderCount, "folder"],
            [counts.secretRotationCount, "rotation"],
            [counts.dynamicSecretCount, "dynamic secret"],
            [canReadHoneyTokens ? (counts.honeyTokenCount ?? 0) : 0, "honey token"]
          ] satisfies [number, string][]
        )
          .filter(([count]) => count > 0)
          .map(([count, noun]) => plural(count, noun))
      : [];
  const stats = statParts.length ? statParts.join(", ") : undefined;

  return (
    <Stack gap={24}>
      <PageHeader title="Secret Insights" description={stats} />
      {hasInsightsPlan ? (
        <>
          <InsightsSummaryCards orgId={orgId} projectId={projectId} />
          <UnusedAccessCard orgId={orgId} projectId={projectId} environmentName={environmentName} />
          <CalendarCard orgId={orgId} projectId={projectId} />
          <Grid gap={24} min="card">
            <DuplicatedSecretsCard orgId={orgId} projectId={projectId} />
            <Stack gap={24}>
              <AccessVolumeCard projectId={projectId} />
              <AuthMethodCard projectId={projectId} />
            </Stack>
          </Grid>
          <AuditReportsCard projectId={projectId} />
        </>
      ) : (
        <InsightsUpgradePreview onUpgrade={handleUpgrade} />
      )}
      {upgradeGate}
    </Stack>
  );
};

export const InsightsPage = () => (
  <>
    <PageTitle title="Insights" />
    <Insights />
  </>
);
