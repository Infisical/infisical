import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { OrganizationResourcesPage } from "./OrganizationResourcesPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/admin/_admin-layout/resources/organizations"
)({
  component: OrganizationResourcesPage,
  beforeLoad: async () => {
    return {
      breadcrumbs: [
        {
          label: "Admin",
          link: linkOptions({ to: "/admin" })
        },
        {
          label: "Organizations",
          link: linkOptions({
            to: "/admin/resources/organizations"
          })
        }
      ]
    };
  }
});
