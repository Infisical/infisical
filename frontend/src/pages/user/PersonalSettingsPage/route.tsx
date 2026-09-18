import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { PersonalSettingsPage } from "./PersonalSettingsPage";

export const personalSettingsSearchSchema = z.object({
  selectedTab: z.enum(["general", "authentication", "api-keys"]).catch("general")
});

export const Route = createFileRoute("/_authenticate/personal-settings/_layout/")({
  component: PersonalSettingsPage,
  validateSearch: zodValidator(personalSettingsSearchSchema)
});
