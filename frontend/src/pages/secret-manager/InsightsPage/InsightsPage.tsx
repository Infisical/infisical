import { Helmet } from "react-helmet";

import { PageHeader } from "@app/components/v2";
import { ProjectPermissionInsightsActions, ProjectPermissionSub } from "@app/context";
import { withProjectPermission } from "@app/hoc";
import { ProjectType } from "@app/hooks/api/projects/types";

import {
  AuthMethodChart,
  CalendarCard,
  InsightsSummaryCards,
  SecretAccessChart,
  WorldMap
} from "./components";

export const InsightsPage = withProjectPermission(
  () => {
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
            <WorldMap />
            <CalendarCard />
          </div>
          <div className="flex flex-1 flex-col gap-6 xl:mt-6">
            <SecretAccessChart />
            <AuthMethodChart />
          </div>
        </div>
      </>
    );
  },
  {
    action: ProjectPermissionInsightsActions.Read,
    subject: ProjectPermissionSub.Insights
  }
);
