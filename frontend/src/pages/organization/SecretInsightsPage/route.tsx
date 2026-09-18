import { createFileRoute } from "@tanstack/react-router";

import { SecretInsightsPage } from "./SecretInsightsPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/secret-management/insights"
)({
  component: SecretInsightsPage,
  context: () => ({
    breadcrumbs: [
      {
        label: "Insights"
      }
    ]
  })
});
