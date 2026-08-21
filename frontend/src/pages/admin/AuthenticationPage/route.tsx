import { createFileRoute } from "@tanstack/react-router";

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
          link: { to: "/admin" as const }
        },
        {
          label: "Authentication",
          link: { to: "/admin/authentication" as const }
        }
      ]
    };
  }
});
