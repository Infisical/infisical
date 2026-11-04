import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { RoleByIDPage } from "./RoleByIDPage";

export const Route = createFileRoute("/v4/organizations/$orgId/roles/$roleId")({
  component: RoleByIDPage,
  pendingComponent: lazyRouteComponent(() => import("../../V4PageLoader"), "V4PageLoader")
});
