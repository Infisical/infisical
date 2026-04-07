import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { SettingsPage } from "./SettingsPage";

const SettingsPageQueryParams = z.object({
  selectedTab: z.string().catch("tab-project-general")
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/secret-management/$projectId/_secret-manager-layout/settings"
)({
  component: SettingsPage,
  validateSearch: zodValidator(SettingsPageQueryParams),
  search: {
    middlewares: [stripSearchParams({ selectedTab: "" })]
  },
  beforeLoad: ({ context }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Settings"
        }
      ]
    };
  }
});
