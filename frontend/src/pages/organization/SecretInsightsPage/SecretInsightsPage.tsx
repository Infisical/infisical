import { Fragment, ReactNode } from "react";
import { Helmet } from "react-helmet";
import { BoxIcon, KeyIcon, LayersIcon, RefreshCwIcon } from "lucide-react";

import { PageHeader } from "@app/components/v2";
import { Skeleton } from "@app/components/v3";
import { OrgPermissionSubjects, useOrganization } from "@app/context";
import { OrgPermissionSecretsManagementInsightsActions } from "@app/context/OrgPermissionContext/types";
import { withPermission } from "@app/hoc";
import {
  useGetOrgAuthMethodDistribution,
  useGetOrgSecretsAccessVolume,
  useGetOrgSecretsCounts,
  useGetOrgSecretsProjects,
  useGetOrgSecretsSummary,
  useGetOrgStaticSecretsUsage
} from "@app/hooks/api";
import { ProjectType } from "@app/hooks/api/projects/types";

import {
  AuthMethodsCard,
  NeedsAttentionCard,
  SecretAccessVolumeCard,
  StaticSecretPresenceCard,
  SummaryCard
} from "./components";

export const SecretInsightsPage = withPermission(
  () => {
    const { currentOrg } = useOrganization();

    const { data: summary, isPending: isSummaryPending } = useGetOrgSecretsSummary(currentOrg.id);
    // limit 100 is the endpoint maximum; orgs with more projects need real pagination later
    const { data: projectsInsights, isPending: isProjectsPending } = useGetOrgSecretsProjects(
      currentOrg.id,
      { limit: 100 }
    );
    const { data: authMethodUsage, isPending: isAuthMethodsPending } =
      useGetOrgAuthMethodDistribution(currentOrg.id);
    const { data: staticSecretUsage, isPending: isStaticSecretsPending } =
      useGetOrgStaticSecretsUsage(currentOrg.id);
    const { data: accessVolume, isPending: isAccessVolumePending } = useGetOrgSecretsAccessVolume(
      currentOrg.id
    );

    const { data: counts } = useGetOrgSecretsCounts(currentOrg.id);

    // isSupported decides whether the audit-log-backed cards render at all
    // (e.g. self-hosted instances without ClickHouse). While the auth methods query is
    // pending we keep its grid slot so the row doesn't reflow when the card appears.
    const showAuthMethodsSlot = isAuthMethodsPending || Boolean(authMethodUsage?.isSupported);

    const headerStats: { label: string; value: number; icon: ReactNode }[] = counts
      ? [
          {
            label: "projects",
            value: counts.projects,
            icon: <BoxIcon className="size-3.5 text-accent" />
          },
          {
            label: "secrets",
            value: counts.secrets,
            icon: <KeyIcon className="size-3.5 text-accent" />
          },
          {
            label: "environments",
            value: counts.environments,
            icon: <LayersIcon className="size-3.5 text-accent" />
          },
          {
            label: "rotations",
            value: counts.rotations,
            icon: <RefreshCwIcon className="size-3.5 text-secret-rotation" />
          }
        ]
      : [];

    const renderStatStrip = (className: string) => (
      <div className={`flex-wrap items-center gap-x-2 gap-y-1 text-xs text-accent ${className}`}>
        {headerStats.map((stat, idx) => (
          <Fragment key={stat.label}>
            {idx > 0 && <span className="text-border">|</span>}
            <span className="flex items-center gap-1 whitespace-nowrap">
              {stat.icon}
              <span className="ml-1">
                <span className="text-foreground/75">{stat.value.toLocaleString()}</span>{" "}
                {stat.label}
              </span>
            </span>
          </Fragment>
        ))}
      </div>
    );

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
              {renderStatStrip("hidden justify-end dashboard:flex")}
            </PageHeader>
            {renderStatStrip("mb-6 flex justify-start dashboard:hidden")}
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
                <NeedsAttentionCard data={projectsInsights} />
              )}
              <div
                className={
                  showAuthMethodsSlot ? "grid gap-4 xl:grid-cols-[1.35fr_1fr]" : "grid gap-4"
                }
              >
                {isAuthMethodsPending && <Skeleton className="h-[320px]" />}
                {!isAuthMethodsPending && authMethodUsage?.isSupported && (
                  <AuthMethodsCard data={authMethodUsage} />
                )}
                {isStaticSecretsPending && <Skeleton className="h-[320px]" />}
                {!isStaticSecretsPending && staticSecretUsage && (
                  <StaticSecretPresenceCard data={staticSecretUsage} />
                )}
              </div>
              {isAccessVolumePending && <Skeleton className="h-[300px]" />}
              {!isAccessVolumePending && accessVolume?.isSupported && (
                <SecretAccessVolumeCard data={accessVolume} />
              )}
            </div>
          </div>
        </div>
      </>
    );
  },
  {
    action: OrgPermissionSecretsManagementInsightsActions.Read,
    subject: OrgPermissionSubjects.SecretsManagementInsights
  }
);
