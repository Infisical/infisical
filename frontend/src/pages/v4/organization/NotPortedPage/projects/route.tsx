import { createFileRoute, lazyRouteComponent, redirect } from "@tanstack/react-router";

import { NotPortedPage } from "../NotPortedPage";

export const Route = createFileRoute("/v4/organizations/$orgId/projects/$")({
  beforeLoad: ({ context, location }) => {
    if (context.v4Mode === "live") {
      throw redirect({ href: location.href.replace(/^\/v4/, ""), replace: true });
    }
  },
  component: NotPortedPage,
  pendingComponent: lazyRouteComponent(() => import("../../../V4PageLoader"), "V4PageLoader"),
  errorComponent: lazyRouteComponent(() => import("../../../V4ErrorPage"), "V4ErrorPage")
});
