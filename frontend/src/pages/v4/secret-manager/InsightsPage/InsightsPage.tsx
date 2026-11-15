import { useCallback } from "react";
import { Icon } from "@infisical/cipher/ui/icon";
import { Grid, Inline, Stack } from "@infisical/cipher/ui/layout";
import { Loader } from "@infisical/cipher/ui/loader";
import { PageHeader } from "@infisical/cipher/ui/page-header";
import { SmallText } from "@infisical/cipher/ui/text";
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
  const stats = counts
    ? [
        { icon: "key" as const, label: "secrets", value: counts.secretCount },
        { icon: "layout-grid" as const, label: "environments", value: environments.length },
        { icon: "folder" as const, label: "folders", value: counts.folderCount },
        { icon: "sync" as const, label: "rotations", value: counts.secretRotationCount },
        { icon: "zap" as const, label: "dynamic secrets", value: counts.dynamicSecretCount },
        ...(counts.honeyTokenCount !== null && canReadHoneyTokens
          ? [{ icon: "shield" as const, label: "honey tokens", value: counts.honeyTokenCount }]
          : [])
      ]
    : [];

  return (
    <Stack gap={24}>
      <PageHeader
        title="Secret Insights"
        actions={
          stats.length > 0 && (
            <Inline gap={16} justify="end">
              {stats.map((stat) => (
                <Inline key={stat.label} gap={6} align="center" wrap={false}>
                  <Icon name={stat.icon} />
                  <span>{stat.value.toLocaleString()}</span>
                  <SmallText muted>{stat.label}</SmallText>
                </Inline>
              ))}
            </Inline>
          )
        }
      />
      {hasInsightsPlan ? (
        <>
          <InsightsSummaryCards orgId={orgId} projectId={projectId} />
          <AuditReportsCard projectId={projectId} />
          <UnusedAccessCard orgId={orgId} projectId={projectId} environmentName={environmentName} />
          <Grid gap={24} columns={2}>
            <Stack gap={24}>
              <DuplicatedSecretsCard orgId={orgId} projectId={projectId} />
              <CalendarCard orgId={orgId} projectId={projectId} />
            </Stack>
            <Stack gap={24}>
              <AccessVolumeCard projectId={projectId} />
              <AuthMethodCard projectId={projectId} />
            </Stack>
          </Grid>
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
