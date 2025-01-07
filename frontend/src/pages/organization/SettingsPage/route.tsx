import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { SettingsPage } from "./SettingsPage";

const SettingsPageQueryParams = z.object({
  selectedTab: z.string().catch("")
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/organization/_layout/settings"
)({
  component: SettingsPage,
  validateSearch: zodValidator(SettingsPageQueryParams),
  search: {
    middlewares: [stripSearchParams({ selectedTab: "" })]
  }
});
