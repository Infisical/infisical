import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { MachineIdentitiesResourcesPage } from "./MachineIdentitiesResourcesPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/admin/_admin-layout/resources/machine-identities"
)({
  component: MachineIdentitiesResourcesPage,
  beforeLoad: async () => {
    return {
      breadcrumbs: [
        {
          label: "Admin",
          link: linkOptions({ to: "/admin" })
        },
        {
          label: "Machine Identities",
          link: linkOptions({
            to: "/admin/resources/machine-identities"
          })
        }
      ]
    };
  }
});
