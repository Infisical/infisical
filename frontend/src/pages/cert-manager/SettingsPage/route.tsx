import { createFileRoute } from "@tanstack/react-router";

import { SettingsPage } from "./SettingsPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/cert-manager/$projectId/_cert-manager-layout/settings"
)({
  component: SettingsPage
});
