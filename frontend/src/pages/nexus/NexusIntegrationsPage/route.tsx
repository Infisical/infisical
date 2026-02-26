import { createFileRoute } from "@tanstack/react-router";

import { NexusIntegrationsPage } from "./NexusIntegrationsPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/nexus/$projectId/_nexus-layout/integrations"
)({
  component: NexusIntegrationsPage,
  beforeLoad: ({ context }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Integrations"
        }
      ]
    };
  }
});
