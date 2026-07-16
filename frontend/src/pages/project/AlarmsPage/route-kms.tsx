import { createFileRoute } from "@tanstack/react-router";

import { AlarmsPage } from "./AlarmsPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/kms/$projectId/_kms-layout/alarms"
)({
  component: AlarmsPage,
  beforeLoad: ({ context }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Alarms"
        }
      ]
    };
  }
});
