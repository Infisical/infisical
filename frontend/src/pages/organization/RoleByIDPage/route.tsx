import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { RoleByIDPage } from "./RoleByIDPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/organization/_layout/roles/$roleId"
)({
  component: RoleByIDPage,
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
        label: "RBAC"
      }
    ]
  })
});
