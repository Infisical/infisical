import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { KmsSettingsPage } from "./KmsSettingsPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organization/kms/settings"
)({
  component: KmsSettingsPage,
  context: () => ({
    breadcrumbs: [
      {
        label: "KMS",
        link: linkOptions({ to: "/organization/kms/overview" })
      },
      {
        label: "Settings"
      }
    ]
  })
});
