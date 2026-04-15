import { useEffect } from "react";
import { Helmet } from "react-helmet";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { PageHeader } from "@app/components/v2";
import {
  ProjectPermissionInsightsActions,
  ProjectPermissionSub,
  useSubscription
} from "@app/context";
import { withProjectPermission } from "@app/hoc";
import { ProjectType } from "@app/hooks/api/projects/types";
import { usePopUp } from "@app/hooks/usePopUp";

import {
  AuthMethodChart,
  CalendarCard,
  InsightsSummaryCards,
  SecretAccessChart
} from "./components";

export const InsightsPage = withProjectPermission(
  () => {
    const { subscription } = useSubscription();
    const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["upgradePlan"] as const);

    useEffect(() => {
      if (subscription && !subscription.secretAccessInsights) {
        handlePopUpOpen("upgradePlan");
      }
    }, [subscription]);

    return (
      <>
        <Helmet>
          <title>Insights</title>
        </Helmet>
        <PageHeader
          scope={ProjectType.SecretManager}
          title="Secret Insights"
          description="Monitor upcoming secret rotations and reminders across your project."
        />
        <InsightsSummaryCards />
        <div className="flex flex-col gap-6 xl:flex-row">
          <div className="mt-6 flex flex-[1.3] flex-col gap-6">
            {/* <WorldMap /> */}
            <CalendarCard />
          </div>
          <div className="flex flex-1 flex-col gap-6 xl:mt-6">
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
