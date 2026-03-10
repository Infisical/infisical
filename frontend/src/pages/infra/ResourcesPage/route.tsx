import { createFileRoute } from "@tanstack/react-router";

import { InfraResourcesPage } from "./InfraResourcesPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/infra/$projectId/_infra-layout/resources"
)({
  component: InfraResourcesPage,
  beforeLoad: ({ context }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        { label: "Resources" }
      ]
    };
  }
});
