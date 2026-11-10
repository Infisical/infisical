import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { EnvironmentPage } from "./EnvironmentPage";

export const Route = createFileRoute("/v4/admin/_v4-admin-shell/environment")({
  staticData: { readiness: "none" },
  component: EnvironmentPage,
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
