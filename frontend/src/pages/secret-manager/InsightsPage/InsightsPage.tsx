import { Fragment, ReactNode, useEffect } from "react";
import { Helmet } from "react-helmet";
import {
  FingerprintIcon,
  FolderIcon,
  HexagonIcon,
  KeyIcon,
  LayersIcon,
  RefreshCwIcon
} from "lucide-react";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { PageHeader } from "@app/components/v2";
import {
  ProjectPermissionInsightsActions,
  ProjectPermissionSub,
  useProject,
  useProjectPermission,
  useSubscription
} from "@app/context";
import { ProjectPermissionHoneyTokenActions } from "@app/context/ProjectPermissionContext/types";
import { withProjectPermission } from "@app/hoc";
import { ProjectType } from "@app/hooks/api/projects/types";
import { useGetInsightsCounts } from "@app/hooks/api/secretInsights/queries";
import { usePopUp } from "@app/hooks/usePopUp";

import {
  AuthMethodChart,
  CalendarCard,
  DuplicatedSecretsCard,
  InsightsSummaryCards,
  SecretAccessChart
} from "./components";

export const InsightsPage = withProjectPermission(
  () => {
    const { subscription } = useSubscription();
    const { currentProject, projectId } = useProject();
    const { permission } = useProjectPermission();
    const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["upgradePlan"] as const);

    const { data: counts } = useGetInsightsCounts(
      { projectId },
      { enabled: Boolean(subscription?.secretAccessInsights) }
    );

    useEffect(() => {
      if (subscription && !subscription.secretAccessInsights) {
        handlePopUpOpen("upgradePlan");
      }
    }, [subscription]);

    const canReadHoneyTokens = permission.can(
      ProjectPermissionHoneyTokenActions.Read,
      ProjectPermissionSub.HoneyTokens
    );

    const headerStats: { label: string; value: number; icon: ReactNode }[] = counts
      ? [
          {
            label: "secrets",
            value: counts.secretCount,
            icon: <KeyIcon className="size-3.5 text-accent" />
          },
          {
            label: "environments",
            value: currentProject.environments.length,
            icon: <LayersIcon className="size-3.5 text-accent" />
          },
          {
            label: "folders",
            value: counts.folderCount,
            icon: <FolderIcon className="size-3.5 text-folder" />
          },
          {
            label: "rotations",
            value: counts.secretRotationCount,
            icon: <RefreshCwIcon className="size-3.5 text-secret-rotation" />
          },
          {
            label: "dynamic secrets",
            value: counts.dynamicSecretCount,
            icon: <FingerprintIcon className="size-3.5 text-dynamic-secret" />
          },
          ...(counts.honeyTokenCount !== null && canReadHoneyTokens
            ? [
                {
                  label: "honey tokens",
                  value: counts.honeyTokenCount,
                  icon: <HexagonIcon className="size-3.5 text-yellow-700" />
                }
              ]
            : [])
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
          <title>Insights</title>
        </Helmet>
        <PageHeader
          className="mb-4 dashboard:mb-10"
          scope={ProjectType.SecretManager}
          title="Secret Insights"
          description="Monitor upcoming secret rotations and reminders across your project."
        >
          {headerStats.length > 0 && renderStatStrip("hidden justify-end dashboard:flex")}
        </PageHeader>
        {headerStats.length > 0 && renderStatStrip("mb-6 flex justify-start dashboard:hidden")}
        <InsightsSummaryCards />
        <div className="mt-6 grid items-start gap-6 xl:grid-cols-[1.3fr_1fr]">
          <div className="flex flex-col gap-6">
            <DuplicatedSecretsCard />
            <CalendarCard />
          </div>
          <div className="flex flex-col gap-6">
            <SecretAccessChart />
            <AuthMethodChart />
          </div>
        </div>
        <UpgradePlanModal
          isOpen={popUp.upgradePlan.isOpen}
          onOpenChange={(isOpen) => {
            handlePopUpToggle("upgradePlan", isOpen);
          }}
          text="Your current plan does not include access to secret insights. To unlock this feature, please upgrade your Infisical plan."
        />
      </>
    );
  },
  {
    action: ProjectPermissionInsightsActions.Read,
    subject: ProjectPermissionSub.Insights
  }
);
