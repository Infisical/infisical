import { createFileRoute } from "@tanstack/react-router";

import { InfraDashboardPage } from "./InfraDashboardPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/infra/$projectId/_infra-layout/overview"
)({
  component: InfraDashboardPage,
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
