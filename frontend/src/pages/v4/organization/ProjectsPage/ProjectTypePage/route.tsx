import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { ProjectTypePage } from "./ProjectTypePage";

export const Route = createFileRoute("/v4/organizations/$orgId/projects/$type/")({
  staticData: { readiness: "partial", missing: ["Live sign-off"] },
  component: ProjectTypePage,
  errorComponent: lazyRouteComponent(() => import("../../../V4ErrorPage"), "V4ErrorPage")
});
