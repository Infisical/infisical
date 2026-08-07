import { Fragment, ReactNode } from "react";
import { Helmet } from "react-helmet";
import { BoxIcon, KeyIcon, LayersIcon, RefreshCwIcon } from "lucide-react";

import { PageHeader } from "@app/components/v2";
import { OrgPermissionSubjects } from "@app/context";
import { OrgPermissionSecretsManagementInsightsActions } from "@app/context/OrgPermissionContext/types";
import { withPermission } from "@app/hoc";
import { ProjectType } from "@app/hooks/api/projects/types";

import {
  AuthMethodsCard,
  NeedsAttentionCard,
  SecretAccessVolumeCard,
  StaticSecretPresenceCard,
  SummaryCard
} from "./components";
import {
  MOCK_ACCESS_VOLUME,
  MOCK_AUTH_METHOD_USAGE,
  MOCK_ORG_COUNTS,
  MOCK_PROJECTS_INSIGHTS,
  MOCK_SECRETS_SUMMARY,
  MOCK_STATIC_SECRET_USAGE
} from "./mockData";

export const SecretInsightsPage = withPermission(
  () => {
    // TODO: replace the mock constants with the org insights query hooks once the cards are
    // wired. isSupported comes from the endpoints and decides whether the audit-log-backed
    // cards render at all (e.g. self-hosted instances without ClickHouse).
    const summary = MOCK_SECRETS_SUMMARY;
    const projectsInsights = MOCK_PROJECTS_INSIGHTS;
    const authMethodUsage = MOCK_AUTH_METHOD_USAGE;
    const staticSecretUsage = MOCK_STATIC_SECRET_USAGE;
    const accessVolume = MOCK_ACCESS_VOLUME;
    const counts = MOCK_ORG_COUNTS;

    const headerStats: { label: string; value: number; icon: ReactNode }[] = [
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
    ];

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
              <SummaryCard summary={summary} />
              <NeedsAttentionCard data={projectsInsights} />
              <div
                className={
                  authMethodUsage.isSupported
                    ? "grid gap-4 xl:grid-cols-[1.35fr_1fr]"
                    : "grid gap-4"
                }
              >
                {authMethodUsage.isSupported && <AuthMethodsCard data={authMethodUsage} />}
                <StaticSecretPresenceCard data={staticSecretUsage} />
              </div>
              {accessVolume.isSupported && <SecretAccessVolumeCard data={accessVolume} />}
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
