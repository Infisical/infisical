import { createFileRoute } from "@tanstack/react-router";

import { AlarmsPage } from "./AlarmsPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/alarms"
)({
  component: AlarmsPage,
  context: () => ({
    breadcrumbs: [
      {
        label: "Alarms"
      }
    ]
  })
});
