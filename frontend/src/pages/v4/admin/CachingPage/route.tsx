import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { CachingPage } from "./CachingPage";

export const Route = createFileRoute("/v4/admin/_v4-admin-shell/caching")({
  staticData: { readiness: "none" },
  component: CachingPage,
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
