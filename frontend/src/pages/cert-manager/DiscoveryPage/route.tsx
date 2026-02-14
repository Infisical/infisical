import { createFileRoute } from "@tanstack/react-router";

import { DiscoveryPage } from "./DiscoveryPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/cert-manager/$projectId/_cert-manager-layout/discovery/"
)({
  component: DiscoveryPage,
  beforeLoad: ({ context }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Certificate Discovery"
        }
      ]
    };
  }
});
