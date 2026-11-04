import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { IdentityDetailsByIDPage } from "./IdentityDetailsByIDPage";

export const Route = createFileRoute("/v4/organizations/$orgId/identities/$identityId")({
  component: IdentityDetailsByIDPage,
  pendingComponent: lazyRouteComponent(() => import("../../V4PageLoader"), "V4PageLoader")
});
