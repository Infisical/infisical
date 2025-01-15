import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { AdminPage } from "./AdminPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/organization/_layout/admin"
)({
  component: AdminPage,
  context: () => ({
    breadcrumbs: [
      {
        label: "home",
        link: linkOptions({ to: "/organization/secret-manager/overview" })
      },
      {
        label: "Admin Console"
      }
    ]
  })
});
