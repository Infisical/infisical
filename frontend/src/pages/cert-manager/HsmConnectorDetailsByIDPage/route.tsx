import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { HsmConnectorDetailsByIDPage } from "./HsmConnectorDetailsByIDPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/cert-manager/_cert-manager-layout/hsm-connectors/$connectorId"
)({
  component: HsmConnectorDetailsByIDPage,
  beforeLoad: ({ context, params }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "HSM Connectors",
          link: linkOptions({
            to: "/organizations/$orgId/cert-manager/settings",
            params: {
              orgId: params.orgId
            },
            search: { selectedTab: "hsm-connectors" }
          })
        }
      ]
    };
  }
});
