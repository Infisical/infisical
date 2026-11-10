import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { SettingsPage } from "./SettingsPage";

export const Route = createFileRoute(
  "/v4/organizations/$orgId/projects/secret-management/$projectId/settings"
)({
  staticData: { readiness: "full" },
  component: SettingsPage,
  validateSearch: zodValidator(z.object({ selectedTab: z.string().catch("tab-project-general") })),
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
