import { createFileRoute } from "@tanstack/react-router";

import { CachingPage } from "./CachingPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/admin/_admin-layout/caching"
)({
  component: CachingPage,
  beforeLoad: async () => {
    return {
      breadcrumbs: [
        {
          label: "Admin",
          link: { to: "/admin" as const }
        },
        {
          label: "Caching",
          link: { to: "/admin/caching" as const }
        }
      ]
    };
  }
});
