import { createFileRoute } from "@tanstack/react-router";

import { PersonalSettingsPage } from "./PersonalSettingsPage";

export const Route = createFileRoute("/_authenticate/personal-settings/_layout/")({
  component: PersonalSettingsPage
});
