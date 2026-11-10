import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { AccessManagementPage } from "./AccessManagementPage";

export const Route = createFileRoute("/v4/admin/_v4-admin-shell/access-management")({
  staticData: { readiness: "none" },
  component: AccessManagementPage,
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
