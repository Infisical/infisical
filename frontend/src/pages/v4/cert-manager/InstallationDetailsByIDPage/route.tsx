import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { InstallationDetailsByIDPage } from "./InstallationDetailsByIDPage";

export const Route = createFileRoute(
  "/v4/organizations/$orgId/cert-manager/discovery/installations/$installationId"
)({
  staticData: { readiness: "full" },
  component: InstallationDetailsByIDPage,
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
