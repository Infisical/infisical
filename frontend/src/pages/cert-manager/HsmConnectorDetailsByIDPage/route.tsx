import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { HsmConnectorDetailsByIDPage } from "./HsmConnectorDetailsByIDPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/cert-manager/$projectId/_cert-manager-layout/hsm-connectors/$connectorId"
)({
  component: HsmConnectorDetailsByIDPage,
  beforeLoad: ({ context, params }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "HSM Connectors",
          link: linkOptions({
            to: "/organizations/$orgId/projects/cert-manager/$projectId/settings",
            params: {
              orgId: params.orgId,
              projectId: params.projectId
            },
            search: { selectedTab: "hsm-connectors" }
          })
        }
      ]
    };
  }
});
