import { createFileRoute, redirect } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { SettingsPage } from "./SettingsPage";

const settingsPageSearchSchema = z.object({
  selectedTab: z.string().optional().default("app-connections")
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/cert-manager/_cert-manager-layout/settings"
)({
  component: SettingsPage,
  validateSearch: zodValidator(settingsPageSearchSchema),
  beforeLoad: ({ context, params, search }) => {
    if (search.selectedTab === "projects") {
      throw redirect({
        to: "/organizations/$orgId/projects/cert-manager/product-settings",
        params: { orgId: params.orgId }
      });
    }
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
