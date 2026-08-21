import { createFileRoute } from "@tanstack/react-router";

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
          link: { to: "/admin" as const }
        },
        {
          label: "Integrations",
          link: { to: "/admin/integrations" as const }
        }
      ]
    };
  }
});
