import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { UserDetailsByIDPage } from "./UserDetailsByIDPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/members/$membershipId"
)({
  component: UserDetailsByIDPage,
  context: ({ params }) => ({
    breadcrumbs: [
      {
        label: "Access Control",
        link: linkOptions({ to: "/organizations/$orgId/access-management" as const, params })
      },
      {
        label: "Users"
      }
    ]
  })
});
