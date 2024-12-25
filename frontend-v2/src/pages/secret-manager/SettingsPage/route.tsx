import { createFileRoute } from "@tanstack/react-router";

import { SettingsPage } from "./SettingsPage";

export const Route = createFileRoute(
  "/_authenticate/_ctx-org-details/secret-manager/$projectId/_layout-secret-manager/settings/"
)({
  component: SettingsPage
});
