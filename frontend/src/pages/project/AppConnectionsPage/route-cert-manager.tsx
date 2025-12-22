import { createFileRoute } from "@tanstack/react-router";

import { AppConnectionsPage } from "./AppConnectionsPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/cert-manager/$projectId/_cert-manager-layout/app-connections"
)({
  component: AppConnectionsPage,
  beforeLoad: ({ context }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "App Connections"
        }
      ]
    };
  }
});
