import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { SettingsPage } from "./SettingsPage";

export const Route = createFileRoute("/v4/organizations/$orgId/secret-scanning/settings")({
  staticData: {
    readiness: "partial",
    missing: ["General settings for organizations with several Secret Scanning projects"]
  },
  component: SettingsPage,
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
