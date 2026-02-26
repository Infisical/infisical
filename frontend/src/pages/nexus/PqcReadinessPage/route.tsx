import { createFileRoute } from "@tanstack/react-router";

import { PqcReadinessPage } from "./PqcReadinessPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/nexus/$projectId/_nexus-layout/pqc-readiness"
)({
  component: PqcReadinessPage,
  beforeLoad: ({ context }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "PQC Readiness"
        }
      ]
    };
  }
});
