import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { RoleByIDPage } from "./RoleByIDPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organization/roles/$roleId"
)({
  component: RoleByIDPage,
  context: () => ({
    breadcrumbs: [
      {
        label: "Access Control",
        link: linkOptions({ to: "/organization/access-management" })
      },
      {
        label: "Roles"
      }
    ]
  })
});
