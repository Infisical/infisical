import { createFileRoute } from "@tanstack/react-router";

import { AdminPage } from "./AdminPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organization/admin"
)({
  component: AdminPage,
  context: () => ({
    breadcrumbs: [
      {
        label: "Admin Console"
      }
    ]
  })
});
