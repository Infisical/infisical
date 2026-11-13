import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { ExpiringPage } from "./ExpiringPage";

export const Route = createFileRoute("/v4/organizations/$orgId/cert-manager/expiring")({
  staticData: { readiness: "full" },
  component: ExpiringPage,
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
