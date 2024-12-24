import { createFileRoute } from "@tanstack/react-router";

import { PersonalSettingsPage } from "./PersonalSettingsPage";

export const Route = createFileRoute("/_authenticate/personal-settings/_personal-settings-layout/")(
  {
    component: PersonalSettingsPage
  }
);
