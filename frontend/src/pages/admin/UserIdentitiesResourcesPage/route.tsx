import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { UserIdentitiesResourcesPage } from "./UserIdentitiesResourcesPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/admin/_admin-layout/resources/user-identities"
)({
  component: UserIdentitiesResourcesPage,
  beforeLoad: async () => {
    return {
      breadcrumbs: [
        {
          label: "Admin",
          link: linkOptions({ to: "/admin" })
        },
        {
          label: "User Identities",
          link: linkOptions({
            to: "/admin/resources/user-identities"
          })
        }
      ]
    };
  }
});
