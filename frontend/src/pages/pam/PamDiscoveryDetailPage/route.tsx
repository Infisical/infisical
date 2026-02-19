import { createFileRoute } from "@tanstack/react-router";

import { PamDiscoveryDetailPage } from "./PamDiscoveryDetailPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/pam/$projectId/_pam-layout/discovery/$discoveryType/$discoverySourceId"
)({
  beforeLoad: ({ context }) => {
    return {
      breadcrumbs: [...context.breadcrumbs, { label: "Discovery" }, { label: "Details" }]
    };
  },
  component: PamDiscoveryDetailPage
});
