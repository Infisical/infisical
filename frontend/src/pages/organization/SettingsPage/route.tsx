import { createFileRoute, redirect, stripSearchParams } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { SettingsPage } from "./SettingsPage";

const SettingsPageQueryParams = z.object({
  selectedTab: z.string().catch("")
});

// These tabs moved to dedicated pages; keep old deep links (bookmarks, backend
// redirects like the Slack install and SCIM setup flows) working.
const MOVED_SETTINGS_TABS: Record<string, { to: string; selectedTab: string }> = {
  "workflow-integrations": {
    to: "/organizations/$orgId/integrations",
    selectedTab: "workflow-integrations"
  },
  "tag-audit-log-streams": {
    to: "/organizations/$orgId/audit-logs",
    selectedTab: "streams"
  },
  "oauth-applications": {
    to: "/organizations/$orgId/oauth-applications",
    selectedTab: ""
  },
  "tab-external-migrations": {
    to: "/organizations/$orgId/integrations",
    selectedTab: "external-migrations"
  },
  "sso-settings": { to: "/organizations/$orgId/sso", selectedTab: "sso" },
  "provisioning-settings": { to: "/organizations/$orgId/sso", selectedTab: "provisioning" }
};

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/settings/"
)({
  component: SettingsPage,
  validateSearch: zodValidator(SettingsPageQueryParams),
  search: {
    middlewares: [stripSearchParams({ selectedTab: "" })]
  },
  context: () => ({
    breadcrumbs: [
      {
        label: "Settings"
      }
    ]
  }),
  beforeLoad: ({ params, search }) => {
    const moved = MOVED_SETTINGS_TABS[search.selectedTab];
    if (moved) {
      throw redirect({
        to: moved.to,
        params: { orgId: params.orgId },
        search: { selectedTab: moved.selectedTab }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
    }
  }
});
