import { createFileRoute } from "@tanstack/react-router";

import { AlertsPage } from "./AlertsPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/alerts"
)({
  component: AlertsPage,
  context: () => ({
    breadcrumbs: [
      {
        label: "Alerts"
      }
    ]
  })
});
