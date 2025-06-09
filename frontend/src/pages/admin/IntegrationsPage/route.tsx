import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { IntegrationsPage } from "./IntegrationsPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/admin/_admin-layout/integrations"
)({
  component: IntegrationsPage,
  beforeLoad: async () => {
    return {
      breadcrumbs: [
        {
          label: "Admin",
          link: linkOptions({ to: "/admin" })
        },
        {
          label: "Integrations",
          link: linkOptions({
            to: "/admin/integrations"
          })
        }
      ]
    };
  }
});
