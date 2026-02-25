import { createFileRoute } from "@tanstack/react-router";

import { ArbiterPage } from "./ArbiterPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/ai/$projectId/_ai-layout/arbiter"
)({
  component: ArbiterPage,
  beforeLoad: ({ context }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Arbiter"
        }
      ]
    };
  }
});
