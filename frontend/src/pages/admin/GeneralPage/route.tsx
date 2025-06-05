import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { GeneralPage } from "./GeneralPage";

export const Route = createFileRoute("/_authenticate/_inject-org-details/admin/_admin-layout/")({
  component: GeneralPage,
  beforeLoad: async () => {
    return {
      breadcrumbs: [
        {
          label: "Admin",
          link: linkOptions({ to: "/admin" })
        },
        {
          label: "General",
          link: linkOptions({
            to: "/admin"
          })
        }
      ]
    };
  }
});
