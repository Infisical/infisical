import { Helmet } from "react-helmet";

import { PageHeader } from "@app/components/v2";
import { ProjectPermissionPamInsightsActions, ProjectPermissionSub } from "@app/context";
import { withProjectPermission } from "@app/hoc";
import { ProjectType } from "@app/hooks/api/projects/types";

import {
  PamInsightsKpiCards,
  PamResourceBreakdown,
  PamRotationCalendar,
  PamSessionActivityChart,
  PamTopActors
} from "./components";

export const InsightsPage = withProjectPermission(
  () => {
    return (
      <>
        <Helmet>
          <title>PAM Insights</title>
        </Helmet>
        <PageHeader
          scope={ProjectType.PAM}
          title="PAM Insights"
          description="Monitor privileged access activity, account rotation health, and session usage across your project."
        />
        <PamInsightsKpiCards />
        <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[1.3fr_1fr]">
          <div className="flex flex-col gap-6">
            <PamRotationCalendar />
            <PamResourceBreakdown />
          </div>
          <div className="flex flex-col gap-6">
            <PamSessionActivityChart />
            <PamTopActors />
          </div>
        </div>
      </>
    );
  },
  {
    action: ProjectPermissionPamInsightsActions.Read,
    subject: ProjectPermissionSub.PamInsights
  }
);
