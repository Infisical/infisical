import { createFileRoute } from "@tanstack/react-router";

import { GatewayListPage } from "./GatewayListPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organization/gateways/"
)({
  component: GatewayListPage,
  context: () => ({
    breadcrumbs: [
      {
        label: "Gateways"
      }
    ]
  })
});
