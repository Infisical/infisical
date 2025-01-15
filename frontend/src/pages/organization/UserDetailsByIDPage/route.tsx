import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { UserDetailsByIDPage } from "./UserDetailsByIDPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/organization/_layout/members/$membershipId"
)({
  component: UserDetailsByIDPage,
  context: () => ({
    breadcrumbs: [
      {
        label: "home",
        link: linkOptions({ to: "/organization/secret-manager/overview" })
      },
      {
        label: "Access Control",
        link: linkOptions({ to: "/organization/access-management" })
      },
      {
        label: "Users"
      }
    ]
  })
});
