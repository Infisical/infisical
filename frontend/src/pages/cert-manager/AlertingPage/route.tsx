import { createFileRoute } from "@tanstack/react-router";

import { AlertingPage } from "./AlertingPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/cert-manager/$projectId/_cert-manager-layout/alerting"
)({
  component: AlertingPage,
  beforeLoad: ({ context }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Alerting"
        }
      ]
    };
  }
});
