import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { OverviewPage } from "./OverviewPage";

export const Route = createFileRoute("/v4/organizations/$orgId/projects/kms/$projectId/overview")({
  staticData: {
    readiness: "partial",
    missing: ["Create key", "Import keys", "Key operations", "Export key", "Edit key", "Delete key"]
  },
  component: OverviewPage,
  pendingComponent: lazyRouteComponent(() => import("../../V4PageLoader"), "V4PageLoader"),
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
