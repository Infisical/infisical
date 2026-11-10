import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { SettingsPage } from "./SettingsPage";

export const Route = createFileRoute("/v4/organizations/$orgId/projects/kms/$projectId/settings")({
  staticData: { readiness: "full" },
  component: SettingsPage,
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
