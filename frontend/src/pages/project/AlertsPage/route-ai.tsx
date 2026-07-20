import { createFileRoute } from "@tanstack/react-router";

import { AlertsPage } from "./AlertsPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/ai/$projectId/_ai-layout/alerts"
)({
  component: AlertsPage,
  beforeLoad: ({ context }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Alerts"
        }
      ]
    };
  }
});
