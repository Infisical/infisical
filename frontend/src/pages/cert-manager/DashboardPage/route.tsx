import { createFileRoute } from "@tanstack/react-router";

import { DashboardPage } from "./DashboardPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/cert-manager/$projectId/_cert-manager-layout/overview"
)({
  component: DashboardPage,
  beforeLoad: ({ context }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Dashboard"
        }
      ]
    };
  }
});
