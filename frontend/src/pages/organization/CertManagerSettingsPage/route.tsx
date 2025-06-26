import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { CertManagerSettingsPage } from "./CertManagerSettingsPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organization/cert-manager/settings"
)({
  component: CertManagerSettingsPage,
  context: () => ({
    breadcrumbs: [
      {
        label: "Cert Management",
        link: linkOptions({ to: "/organization/cert-manager/overview" })
      },
      {
        label: "Settings"
      }
    ]
  })
});
