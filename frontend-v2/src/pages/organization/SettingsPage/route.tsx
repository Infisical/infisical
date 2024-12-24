import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { SettingsPage } from "./SettingsPage";

const SettingsPageQueryParams = z.object({
  selectedTab: z.string().catch("")
});

export const Route = createFileRoute(
  "/_authenticate/_ctx-org-details/organization/_layout-org/settings/"
)({
  component: SettingsPage,
  validateSearch: zodValidator(SettingsPageQueryParams)
});
