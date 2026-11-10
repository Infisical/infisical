import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { AuthenticationPage } from "./AuthenticationPage";

export const Route = createFileRoute("/v4/admin/_v4-admin-shell/authentication")({
  staticData: { readiness: "full" },
  component: AuthenticationPage,
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
