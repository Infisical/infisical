import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { UserDetailsByIDPage } from "./UserDetailsByIDPage";

export const Route = createFileRoute("/v4/organizations/$orgId/members/$membershipId")({
  component: UserDetailsByIDPage,
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
