import { createFileRoute } from "@tanstack/react-router";

import { InfraStatePage } from "./InfraStatePage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/infra/$projectId/_infra-layout/state"
)({
  component: InfraStatePage,
  beforeLoad: ({ context }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        { label: "State" }
      ]
    };
  }
});
