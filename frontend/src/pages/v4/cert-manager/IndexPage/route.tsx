import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { IndexPage } from "./IndexPage";

export const Route = createFileRoute("/v4/organizations/$orgId/cert-manager/")({
  staticData: { readiness: "partial", missing: ["Applications"] },
  component: IndexPage,
  pendingComponent: lazyRouteComponent(() => import("../../V4PageLoader"), "V4PageLoader"),
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
