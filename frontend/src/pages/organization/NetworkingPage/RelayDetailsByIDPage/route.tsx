import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { RelayDetailsByIDPage } from "./RelayDetailsByIDPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/networking/relays/$relayId"
)({
  component: RelayDetailsByIDPage,
  context: ({ params }) => ({
    breadcrumbs: [
      {
        label: "Networking",
        link: linkOptions({ to: "/organizations/$orgId/networking" as const, params })
      },
      {
        label: "Relays"
      }
    ]
  })
});
