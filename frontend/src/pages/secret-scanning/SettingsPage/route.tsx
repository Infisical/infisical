import { createFileRoute } from "@tanstack/react-router";

import { SettingsPage } from "./SettingsPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/projects/secret-scanning/$projectId/_secret-scanning-layout/settings"
)({
  component: SettingsPage,
  beforeLoad: ({ context }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Settings"
        }
      ]
    };
  }
});
