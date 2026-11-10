import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { WelcomePage } from "./WelcomePage";

export const Route = createFileRoute("/v4/admin/welcome")({
  staticData: { readiness: "none" },
  component: WelcomePage,
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
