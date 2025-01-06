import { createFileRoute } from "@tanstack/react-router";

import { SettingsPage } from "./SettingsPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/settings"
)({
  component: SettingsPage
});
