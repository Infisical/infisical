import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { ApplicationsPage } from "./ApplicationsPage";

export const Route = createFileRoute("/v4/organizations/$orgId/cert-manager/applications/")({
  staticData: { readiness: "full" },
  component: ApplicationsPage,
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
