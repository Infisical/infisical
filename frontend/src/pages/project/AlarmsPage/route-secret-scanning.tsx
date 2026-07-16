import { createFileRoute } from "@tanstack/react-router";

import { AlarmsPage } from "./AlarmsPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/secret-scanning/$projectId/_secret-scanning-layout/alarms"
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
