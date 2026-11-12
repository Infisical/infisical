import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { PersonalSettingsPage } from "./PersonalSettingsPage";

export const Route = createFileRoute("/v4/personal-settings/")({
  staticData: { readiness: "full" },
  component: PersonalSettingsPage,
  pendingComponent: lazyRouteComponent(() => import("../../V4PageLoader"), "V4PageLoader"),
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
