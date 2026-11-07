import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { SettingsPage } from "./SettingsPage";

export const Route = createFileRoute("/v4/organizations/$orgId/settings")({
  component: SettingsPage,
  validateSearch: zodValidator(z.object({ selectedTab: z.string().catch("") }))
});
