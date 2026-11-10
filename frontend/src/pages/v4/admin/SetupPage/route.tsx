import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { SetupPage } from "./SetupPage";

export const Route = createFileRoute("/v4/admin/setup")({
  staticData: { readiness: "none" },
  component: SetupPage,
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
