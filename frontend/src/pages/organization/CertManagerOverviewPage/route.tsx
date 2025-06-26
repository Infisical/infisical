import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { CertManagerOverviewPage } from "./CertManagerOverviewPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organization/cert-manager/overview"
)({
  component: CertManagerOverviewPage,
  context: () => ({
    breadcrumbs: [
      {
        label: "Cert Management",
        link: linkOptions({ to: "/organization/cert-manager/overview" })
      }
    ]
  })
});
