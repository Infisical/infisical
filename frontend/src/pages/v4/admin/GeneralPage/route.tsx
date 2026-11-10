import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { GeneralPage } from "./GeneralPage";

export const Route = createFileRoute("/v4/admin/_v4-admin-shell/")({
  staticData: { readiness: "full" },
  component: GeneralPage,
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
