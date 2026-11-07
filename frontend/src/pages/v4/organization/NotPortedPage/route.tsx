import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { NotPortedPage } from "./NotPortedPage";

export const Route = createFileRoute("/v4/organizations/$orgId/$")({
  staticData: { readiness: "none" },
  component: NotPortedPage,
  pendingComponent: lazyRouteComponent(() => import("../../V4PageLoader"), "V4PageLoader"),
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
