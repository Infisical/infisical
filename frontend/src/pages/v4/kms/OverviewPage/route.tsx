import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { OverviewPage } from "./OverviewPage";

export const Route = createFileRoute("/v4/organizations/$orgId/projects/kms/$projectId/overview")({
  component: OverviewPage,
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
