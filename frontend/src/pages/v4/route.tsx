import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { V4Root } from "./V4Root";

export const Route = createFileRoute("/v4")({
  component: V4Root,
  pendingComponent: lazyRouteComponent(() => import("./V4PageLoader"), "V4PageLoader"),
  errorComponent: lazyRouteComponent(() => import("./V4ErrorPage"), "V4ErrorPage"),
  notFoundComponent: lazyRouteComponent(() => import("./V4NotFoundPage"), "V4NotFoundPage")
});
