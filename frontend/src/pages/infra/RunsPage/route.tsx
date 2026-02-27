import { createFileRoute } from "@tanstack/react-router";

import { InfraRunsPage } from "./InfraRunsPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/infra/$projectId/_infra-layout/runs"
)({
  component: InfraRunsPage,
  beforeLoad: ({ context }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        { label: "Runs" }
      ]
    };
  }
});
