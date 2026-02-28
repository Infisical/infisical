import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { DiscoveryDetailsByIDPage } from "./DiscoveryDetailsByIDPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/cert-manager/$projectId/_cert-manager-layout/discovery/$discoveryId"
)({
  component: DiscoveryDetailsByIDPage,
  beforeLoad: ({ context, params }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Discovery",
          link: linkOptions({
            to: "/organizations/$orgId/projects/cert-manager/$projectId/discovery",
            params: {
              orgId: params.orgId,
              projectId: params.projectId
            }
          })
        },
        {
          label: "Job Details"
        }
      ]
    };
  }
});
