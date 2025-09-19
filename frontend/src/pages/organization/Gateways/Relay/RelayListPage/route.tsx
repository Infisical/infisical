import { createFileRoute } from "@tanstack/react-router";

import { RelayListPage } from "./RelayListPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organization/relays/"
)({
  component: RelayListPage,
  context: () => ({
    breadcrumbs: [
      {
        label: "Relays"
      }
    ]
  })
});
