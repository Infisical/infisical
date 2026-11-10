import { createFileRoute } from "@tanstack/react-router";

import { handoffToV4 } from "@app/helpers/v4Bridge";
import { PersonalSettingsLayout } from "@app/layouts/PersonalSettingsLayout";

export const Route = createFileRoute("/_authenticate/personal-settings/_layout")({
  beforeLoad: ({ location }) => handoffToV4(location),
  component: PersonalSettingsLayout
});
