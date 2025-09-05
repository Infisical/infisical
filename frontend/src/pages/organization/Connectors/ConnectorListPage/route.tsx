import { createFileRoute } from "@tanstack/react-router";

import { ConnectorListPage } from "./ConnectorListPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organization/connectors/"
)({
  component: ConnectorListPage,
  context: () => ({
    breadcrumbs: [
      {
        label: "Connectors"
      }
    ]
  })
});
