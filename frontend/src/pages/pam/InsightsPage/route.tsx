import { createFileRoute } from "@tanstack/react-router";

import { InsightsPage } from "./InsightsPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/pam/$projectId/_pam-layout/insights"
)({
  component: InsightsPage,
  beforeLoad: ({ context }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Insights"
        }
      ]
    };
  }
});
