import { createFileRoute, linkOptions } from "@tanstack/react-router";

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
          link: linkOptions({ to: "/admin" })
        },
        {
          label: "Caching",
          link: linkOptions({
            to: "/admin/caching"
          })
        }
      ]
    };
  }
});
