import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { UserDetailsByIDPage } from "./UserDetailsByIDPage";

export const Route = createFileRoute("/v4/organizations/$orgId/members/$membershipId")({
  component: UserDetailsByIDPage,
  pendingComponent: lazyRouteComponent(() => import("../../V4PageLoader"), "V4PageLoader")
});
