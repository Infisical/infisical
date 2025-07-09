import { createFileRoute } from "@tanstack/react-router";

import { AppConnectionsPage } from "./AppConnectionsPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organization/app-connections/"
)({
  component: AppConnectionsPage,
  context: () => ({
    breadcrumbs: [
      {
        label: "App Connections"
      }
    ]
  })
});
