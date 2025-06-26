import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { SshSettingsPage } from "./SshSettingsPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organization/ssh/settings"
)({
  component: SshSettingsPage,
  context: () => ({
    breadcrumbs: [
      {
        label: "SSH",
        link: linkOptions({ to: "/organization/ssh/overview" })
      },
      {
        label: "Settings"
      }
    ]
  })
});
