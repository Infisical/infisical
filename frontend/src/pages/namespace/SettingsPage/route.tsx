import { createFileRoute } from "@tanstack/react-router";

import { SettingsPage } from "./SettingsPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organization/namespaces/$namespaceId/_namespace-layout/settings"
)({
  component: SettingsPage,
  beforeLoad: ({ context }) => ({
    breadcrumbs: [
      ...context.breadcrumbs,
      {
        label: "Settings"
      }
    ]
  })
});
