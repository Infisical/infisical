import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";

import { AppConnectionsPage } from "./AppConnectionsPage";
import { appConnectionsSearch } from "./search";

export const Route = createFileRoute(
  "/v4/organizations/$orgId/projects/secret-management/$projectId/app-connections"
)({
  staticData: { readiness: "full" },
  component: AppConnectionsPage,
  validateSearch: zodValidator(appConnectionsSearch),
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
