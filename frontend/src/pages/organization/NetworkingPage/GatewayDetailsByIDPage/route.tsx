import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { GatewayDetailsByIDPage } from "./GatewayDetailsByIDPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/networking/gateways/$gatewayId"
)({
  component: GatewayDetailsByIDPage,
  context: ({ params }) => ({
    breadcrumbs: [
      {
        label: "Networking",
        link: linkOptions({ to: "/organizations/$orgId/networking" as const, params })
      },
      {
        label: "Gateways"
      }
    ]
  })
});
