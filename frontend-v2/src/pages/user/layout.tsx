import { createFileRoute } from "@tanstack/react-router";

import { PersonalSettingsLayout } from "@app/layouts/PersonalSettingsLayout";

export const Route = createFileRoute("/_authenticate/personal-settings/_personal-settings-layout")({
  component: PersonalSettingsLayout
});
