import { createFileRoute, linkOptions, stripSearchParams } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { SecretSharingSettingsPage } from "./SecretSharingSettingsPage";

const SettingsPageQueryParams = z.object({
  selectedTab: z.string().catch("")
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organization/secret-sharing/settings"
)({
  component: SecretSharingSettingsPage,
  validateSearch: zodValidator(SettingsPageQueryParams),
  search: {
    middlewares: [stripSearchParams({ selectedTab: "" })]
  },
  context: () => ({
    breadcrumbs: [
      {
        label: "Secret Sharing",
        link: linkOptions({ to: "/organization/secret-sharing" })
      },
      {
        label: "Settings"
      }
    ]
  })
});
