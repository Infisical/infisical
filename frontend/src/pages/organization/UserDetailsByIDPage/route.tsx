import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { UserDetailsByIDPage } from "./UserDetailsByIDPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organization/members/$membershipId"
)({
  component: UserDetailsByIDPage,
  context: () => ({
    breadcrumbs: [
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
