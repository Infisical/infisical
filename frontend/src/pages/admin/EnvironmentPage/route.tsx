import { createFileRoute, linkOptions } from "@tanstack/react-router";

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
          link: linkOptions({ to: "/admin" })
        },
        {
          label: "Environment",
          link: linkOptions({
            to: "/admin/environment"
          })
        }
      ]
    };
  }
});
