import { createFileRoute, redirect } from "@tanstack/react-router";

import { IntegrationsListPageTabs } from "@app/types/integrations";

// Redirect old App Connections route to Integrations page with App Connections tab
export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/secret-management/$projectId/_secret-manager-layout/app-connections"
)({
  beforeLoad: ({ params: { orgId, projectId } }) => {
    throw redirect({
      to: "/organizations/$orgId/projects/secret-management/$projectId/integrations",
      params: { orgId, projectId },
      search: { selectedTab: IntegrationsListPageTabs.AppConnections }
    });
  }
});
