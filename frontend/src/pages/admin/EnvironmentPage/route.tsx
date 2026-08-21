import { createFileRoute } from "@tanstack/react-router";

import { EnvironmentPage } from "./EnvironmentPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/admin/_admin-layout/environment"
)({
  component: EnvironmentPage,
  beforeLoad: () => {
    return {
      breadcrumbs: [
        {
          label: "Admin",
          link: { to: "/admin" as const }
        },
        {
          label: "Environment",
          link: { to: "/admin/environment" as const }
        }
      ]
    };
  }
});
