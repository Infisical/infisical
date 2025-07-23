import { createFileRoute } from "@tanstack/react-router";

import { OverviewPage } from "./OverviewPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/projects/kms/$projectId/_kms-layout/overview"
)({
  component: OverviewPage,
  beforeLoad: ({ context }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Overview"
        }
      ]
    };
  }
});
