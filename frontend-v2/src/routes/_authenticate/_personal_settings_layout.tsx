import { createFileRoute } from "@tanstack/react-router";

import { PersonalSettingsLayout } from "@app/layouts/PersonalSettingsLayout";

export const Route = createFileRoute("/_authenticate/_personal_settings_layout")({
  component: PersonalSettingsLayout
});
