import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { RoleByIDPage } from "./RoleByIDPage";

export const Route = createFileRoute("/v4/organizations/$orgId/roles/$roleId")({
  staticData: { readiness: "full" },
  component: RoleByIDPage,
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
