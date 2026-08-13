import { createFileRoute } from "@tanstack/react-router";

import { ProxiedServicesPage } from "./ProxiedServicesPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/secret-management/$projectId/_secret-manager-layout/proxied-services"
)({
  component: ProxiedServicesPage,
  beforeLoad: ({ context }) => {
    return {
      breadcrumbs: [...context.breadcrumbs, { label: "Proxied Services" }]
    };
  }
});
