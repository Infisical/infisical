import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { CertManagerOverviewPage } from "./CertManagerOverviewPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/organization/_layout/cert-manager/overview"
)({
  component: CertManagerOverviewPage,
  context: () => ({
    breadcrumbs: [
      {
        label: "products",
        link: linkOptions({ disabled: true, to: "/" })
      },
      {
        label: "Cert Managers",
        link: linkOptions({ to: "/organization/cert-manager/overview" })
      }
    ]
  })
});
