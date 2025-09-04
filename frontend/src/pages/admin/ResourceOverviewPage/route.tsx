import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { ResourceOverviewPage } from "./ResourceOverviewPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/admin/_admin-layout/resources/overview"
)({
  component: ResourceOverviewPage,
  beforeLoad: async () => {
    return {
      breadcrumbs: [
        {
          label: "Admin",
          link: linkOptions({ to: "/admin" })
        },
        {
          label: "Resource Overview",
          link: linkOptions({
            to: "/admin/resources/overview"
          })
        }
      ]
    };
  }
});
