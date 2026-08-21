import { createFileRoute } from "@tanstack/react-router";

import { AccessManagementPage } from "./AccessManagementPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/admin/_admin-layout/access-management"
)({
  component: AccessManagementPage,
  beforeLoad: async () => {
    return {
      breadcrumbs: [
        {
          label: "Admin",
          link: { to: "/admin" as const }
        },
        {
          label: "Access Control",
          link: { to: "/admin/access-management" as const }
        }
      ]
    };
  }
});
