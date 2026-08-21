import { createFileRoute } from "@tanstack/react-router";

import { GeneralPage } from "./GeneralPage";

export const Route = createFileRoute("/_authenticate/_inject-org-details/admin/_admin-layout/")({
  component: GeneralPage,
  beforeLoad: async () => {
    return {
      breadcrumbs: [
        {
          label: "Admin",
          link: { to: "/admin" as const }
        },
        {
          label: "General",
          link: { to: "/admin" as const }
        }
      ]
    };
  }
});
