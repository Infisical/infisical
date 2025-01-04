import { createFileRoute } from "@tanstack/react-router";

import { SettingsPage } from "./SettingsPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/ssh/$projectId/_ssh-layout/settings"
)({
  component: SettingsPage
});
