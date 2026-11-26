import { createFileRoute, lazyRouteComponent, redirect } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { SettingsPage } from "./SettingsPage";

const MOVED_SETTINGS_TABS: Record<string, string> = {
  "workflow-integrations": "/integrations?selectedTab=workflow-integrations",
  "tag-audit-log-streams": "/audit-logs?selectedTab=streams",
  "oauth-applications": "/oauth-applications",
  "tab-external-migrations": "/integrations?selectedTab=external-migrations",
  "sso-settings": "/sso?selectedTab=sso",
  "provisioning-settings": "/sso?selectedTab=provisioning",
  "project-templates": "/projects/secret-management/product-settings"
};

export const Route = createFileRoute("/v4/organizations/$orgId/settings")({
  staticData: { readiness: "full" },
  component: SettingsPage,
  validateSearch: zodValidator(z.object({ selectedTab: z.string().catch("") })),
  beforeLoad: ({ params, search }) => {
    const moved = MOVED_SETTINGS_TABS[search.selectedTab];
    if (moved) throw redirect({ href: `/v4/organizations/${params.orgId}${moved}`, replace: true });
  },
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
