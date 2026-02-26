import { createFileRoute } from "@tanstack/react-router";

import { ObservabilityPage } from "./ObservabilityPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/observability"
)({
  component: ObservabilityPage,
  context: () => ({
    breadcrumbs: [
      {
        label: "Observability"
      }
    ]
  })
});
