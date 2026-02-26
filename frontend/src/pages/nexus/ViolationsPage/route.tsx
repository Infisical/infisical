import { createFileRoute } from "@tanstack/react-router";

import { ViolationsPage } from "./ViolationsPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/nexus/$projectId/_nexus-layout/violations"
)({
  component: ViolationsPage,
  beforeLoad: ({ context }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        { label: "Violations" }
      ]
    };
  }
});
