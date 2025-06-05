import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { AuthenticationPage } from "./AuthenticationPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/admin/_admin-layout/authentication"
)({
  component: AuthenticationPage,
  beforeLoad: async () => {
    return {
      breadcrumbs: [
        {
          label: "Admin",
          link: linkOptions({ to: "/admin" })
        },
        {
          label: "Authentication",
          link: linkOptions({
            to: "/admin/authentication"
          })
        }
      ]
    };
  }
});
